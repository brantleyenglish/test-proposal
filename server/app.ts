import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import express, { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';

import type { CockpitConfig, DemoUser, SimulationScenario } from '../shared/types';
import { getEntityHistory, verifyAuditChain } from './auditLog';
import {
  CockpitError,
  decideAction,
  decideReview,
  generateRecommendation,
  getAppDetail,
  getIncidentDetail,
  getOverview,
  ingestTelemetry,
  listReviews,
  requirePermission,
  type CockpitState,
} from './cockpit';
import { readAzureOpenAiConfig } from './recommendations';
import { createSeededState, simulationScenarios } from './seed';

const telemetrySourceSchema = z.enum([
  'defender-cloud-apps',
  'entra-id',
  'secure-web-gateway',
  'purview-dlp',
  'browser-extension',
  'employee-report',
]);

const domainSchema = z
  .string()
  .trim()
  .min(3)
  .max(253)
  .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Enter a domain such as tool.example');

const telemetryInputSchema = z.object({
  source: telemetrySourceSchema,
  domain: domainSchema,
  appName: z.string().trim().min(1).max(120).optional(),
  category: z.string().trim().min(1).max(80).optional(),
  pseudonymousUserId: z.string().trim().min(1).max(64).optional(),
  department: z.string().trim().min(1).max(80).optional(),
  dataSensitivity: z.enum(['none', 'internal', 'confidential', 'regulated']).optional(),
  uploadedBytes: z.number().int().nonnegative().optional(),
  accountType: z.enum(['corporate', 'personal']).optional(),
  oauthScopes: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  vendorTrainsOnCustomerData: z.boolean().optional(),
  vendorHasSoc2: z.boolean().optional(),
  vendorSupportsSso: z.boolean().optional(),
  note: z.string().trim().max(1000).optional(),
});

const reportAppSchema = z.object({
  appName: z.string().trim().min(2).max(120),
  domain: domainSchema,
  purpose: z.string().trim().min(5).max(500),
  dataSensitivity: z.enum(['none', 'internal', 'confidential', 'regulated']).optional(),
});

const simulateSchema = z.object({
  scenario: z.enum(['unsanctioned-pdf-tool', 'oauth-agent', 'partial-telemetry']),
});

const reviewDecisionSchema = z.object({
  decision: z.enum(['approve', 'restrict', 'block']),
  rationale: z.string().max(1000),
});

const actionDecisionSchema = z.object({
  verdict: z.enum(['approve', 'reject']),
  rationale: z.string().max(1000),
});

type CreateAppParams = {
  environment?: NodeJS.ProcessEnv;
  fetchImplementation?: typeof fetch;
  staticDirectory?: string;
};

type AuthenticatedRequest = Request & { demoUser?: DemoUser };

const getUser = (request: AuthenticatedRequest) => {
  if (!request.demoUser) {
    throw new CockpitError('Sign in required.', 401);
  }
  return request.demoUser;
};

const getParam = ({ request, name }: { request: Request; name: string }) => {
  const value = request.params[name];
  if (!value) {
    throw new CockpitError(`Missing ${name}.`, 400);
  }
  return value;
};

export const createCockpitApp = ({ environment = process.env, fetchImplementation, staticDirectory }: CreateAppParams = {}) => {
  const azureConfig = readAzureOpenAiConfig(environment);
  const holder: { state: CockpitState } = { state: createSeededState() };
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use('/api', (_request, response, next) => {
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_request, response) => {
    response.json({ status: 'ok' });
  });

  app.get('/api/session/users', (_request, response) => {
    response.json(holder.state.users);
  });

  app.use('/api', (request: AuthenticatedRequest, _response, next) => {
    const userId = request.header('x-demo-user-id');
    request.demoUser = holder.state.users.find((user) => user.id === userId);
    if (!request.demoUser) {
      next(new CockpitError('Unknown or missing demo user. Pick a user in the cockpit header.', 401));
    }
    if (request.demoUser) {
      next();
    }
  });

  app.get('/api/config', (_request, response) => {
    const config: CockpitConfig = {
      recommendationProvider: azureConfig ? 'azure-openai' : 'rules-engine',
      model: azureConfig?.deployment ?? 'cockpit-rules-v1',
      simulatedConnectors: true,
    };
    response.json(config);
  });

  app.get('/api/overview', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-security-data' });
    response.json(getOverview(holder.state));
  });

  app.get('/api/apps', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-security-data' });
    response.json([...holder.state.apps].sort((first, second) => second.risk.score - first.risk.score));
  });

  app.get('/api/apps/catalog', (_request, response) => {
    response.json(
      holder.state.apps
        .filter((candidate) => candidate.status === 'approved' || candidate.status === 'restricted')
        .map(({ id, name, domain, category, status }) => ({ id, name, domain, category, status })),
    );
  });

  app.get('/api/apps/:appId', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-security-data' });
    response.json(getAppDetail({ state: holder.state, appId: getParam({ request, name: 'appId' }) }));
  });

  app.post('/api/apps/report', (request: AuthenticatedRequest, response) => {
    const user = getUser(request);
    requirePermission({ user, permission: 'report-app' });
    const { appName, domain, purpose, dataSensitivity } = reportAppSchema.parse(request.body);
    const result = ingestTelemetry({
      state: holder.state,
      input: {
        source: 'employee-report',
        domain,
        appName,
        dataSensitivity,
        pseudonymousUserId: `reporter-${user.id.slice(-4)}`,
        note: `Reported by an employee. Stated purpose: ${purpose}`,
      },
      actor: user,
    });
    response.status(201).json({
      appId: result.app.id,
      status: result.app.status,
      message: `Thanks. ${result.app.name} is routed for review; you will see the decision in the AI catalog.`,
    });
  });

  app.post('/api/telemetry', (request: AuthenticatedRequest, response) => {
    const user = getUser(request);
    requirePermission({ user, permission: 'ingest-telemetry' });
    const input = telemetryInputSchema.parse(request.body);
    response.status(201).json(ingestTelemetry({ state: holder.state, input, actor: user }));
  });

  app.get('/api/telemetry/scenarios', (_request, response) => {
    response.json(
      Object.entries(simulationScenarios).map(([scenario, { label }]) => ({ scenario, label })),
    );
  });

  app.post('/api/telemetry/simulate', (request: AuthenticatedRequest, response) => {
    const user = getUser(request);
    requirePermission({ user, permission: 'ingest-telemetry' });
    const { scenario } = simulateSchema.parse(request.body);
    const { event } = simulationScenarios[scenario as SimulationScenario];
    response.status(201).json(ingestTelemetry({ state: holder.state, input: event, actor: null }));
  });

  app.get('/api/reviews', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-security-data' });
    response.json(listReviews(holder.state));
  });

  app.post('/api/reviews/:reviewId/decisions', (request: AuthenticatedRequest, response) => {
    const { decision, rationale } = reviewDecisionSchema.parse(request.body);
    response.json(
      decideReview({
        state: holder.state,
        user: getUser(request),
        reviewId: getParam({ request, name: 'reviewId' }),
        decision,
        rationale,
      }),
    );
  });

  app.get('/api/incidents', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-security-data' });
    response.json([...holder.state.incidents].reverse());
  });

  app.get('/api/incidents/:incidentId', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-security-data' });
    response.json(getIncidentDetail({ state: holder.state, incidentId: getParam({ request, name: 'incidentId' }) }));
  });

  app.post('/api/incidents/:incidentId/recommendation', async (request: AuthenticatedRequest, response, next) => {
    try {
      const result = await generateRecommendation({
        state: holder.state,
        user: getUser(request),
        incidentId: getParam({ request, name: 'incidentId' }),
        azureConfig,
        fetchImplementation,
      });
      response.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/incidents/:incidentId/actions/:actionId/decision', (request: AuthenticatedRequest, response) => {
    const { verdict, rationale } = actionDecisionSchema.parse(request.body);
    response.json(
      decideAction({
        state: holder.state,
        user: getUser(request),
        incidentId: getParam({ request, name: 'incidentId' }),
        actionId: getParam({ request, name: 'actionId' }),
        verdict,
        rationale,
      }),
    );
  });

  app.get('/api/audit', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-audit' });
    const entityId = typeof request.query.entityId === 'string' ? request.query.entityId : null;
    const entries = entityId
      ? getEntityHistory({ log: holder.state.auditLog, entityIds: [entityId] })
      : holder.state.auditLog;
    response.json([...entries].reverse());
  });

  app.get('/api/audit/verify', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'view-audit' });
    response.json(verifyAuditChain(holder.state.auditLog));
  });

  app.post('/api/demo/reset', (request: AuthenticatedRequest, response) => {
    requirePermission({ user: getUser(request), permission: 'reset-demo' });
    holder.state = createSeededState();
    response.json({ status: 'reset' });
  });

  if (staticDirectory && existsSync(staticDirectory)) {
    app.use(express.static(staticDirectory));
    app.get(/^(?!\/api).*/, (_request, response) => {
      response.sendFile(resolve(staticDirectory, 'index.html'));
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof CockpitError) {
      response.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof z.ZodError) {
      response.status(400).json({ error: error.issues.map(({ path, message }) => `${path.join('.') || 'body'}: ${message}`).join('; ') });
    }
    if (!(error instanceof CockpitError) && !(error instanceof z.ZodError)) {
      response.status(500).json({ error: 'Unexpected server error.' });
    }
  });

  return { app, getState: () => holder.state };
};
