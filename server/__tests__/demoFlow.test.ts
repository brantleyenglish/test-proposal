import request from 'supertest';

import type { IncidentDetail, Recommendation, ReviewWithApp } from '../../shared/types';
import { createCockpitApp } from '../app';

const analystHeader = { 'x-demo-user-id': 'user-dana' };
const leadHeader = { 'x-demo-user-id': 'user-sam' };
const auditorHeader = { 'x-demo-user-id': 'user-riley' };
const employeeHeader = { 'x-demo-user-id': 'user-alex' };

const offlineEnvironment = {} as NodeJS.ProcessEnv;

describe('demo flow: detect, classify, route, recommend, approve, audit', () => {
  it('runs the full hackathon demonstration end to end', async () => {
    const { app } = createCockpitApp({ environment: offlineEnvironment });

    const detection = await request(app)
      .post('/api/telemetry/simulate')
      .set(analystHeader)
      .send({ scenario: 'unsanctioned-pdf-tool' })
      .expect(201);
    expect(detection.body.app).toMatchObject({ name: 'QuickSummary PDF', status: 'in-review' });
    expect(detection.body.app.risk.tier).toBe('High');
    expect(detection.body.review).toMatchObject({ routedToRole: 'lead', status: 'pending' });
    expect(detection.body.incident.signals.join(' ')).not.toContain('123-45-6789');
    expect(detection.body.incident.ingestRedactionCount).toBe(3);

    const incidentId: string = detection.body.incident.id;
    const recommendationResponse = await request(app)
      .post(`/api/incidents/${incidentId}/recommendation`)
      .set(analystHeader)
      .expect(201);
    const recommendation: Recommendation = recommendationResponse.body.recommendation;
    expect(recommendation.provider).toBe('rules-engine');
    expect(recommendation.proposedActions.every(({ status }) => status === 'awaiting-approval')).toBe(true);
    const blockAction = recommendation.proposedActions.find(({ kind }) => kind === 'block-app');
    const notifyAction = recommendation.proposedActions.find(({ kind }) => kind === 'notify-user');
    expect(blockAction?.requiredRole).toBe('lead');

    await request(app)
      .post(`/api/incidents/${incidentId}/actions/${blockAction?.id}/decision`)
      .set(analystHeader)
      .send({ verdict: 'approve', rationale: 'Confirmed PHI upload in DLP event.' })
      .expect(403);

    await request(app)
      .post(`/api/incidents/${incidentId}/actions/${blockAction?.id}/decision`)
      .set(leadHeader)
      .send({ verdict: 'approve', rationale: 'ok' })
      .expect(400);

    const approved = await request(app)
      .post(`/api/incidents/${incidentId}/actions/${blockAction?.id}/decision`)
      .set(leadHeader)
      .send({ verdict: 'approve', rationale: 'Confirmed PHI upload in DLP event; block until review.' })
      .expect(200);
    expect(approved.body.action.status).toBe('executed');
    expect(approved.body.action.executionResult).toContain('Simulated');

    await request(app)
      .post(`/api/incidents/${incidentId}/actions/${notifyAction?.id}/decision`)
      .set(analystHeader)
      .send({ verdict: 'approve', rationale: 'User needs coaching on the approved tool.' })
      .expect(200);

    const detail = await request(app).get(`/api/incidents/${incidentId}`).set(auditorHeader).expect(200);
    const incidentDetail: IncidentDetail = detail.body;
    const actions = incidentDetail.auditHistory.map(({ action }) => action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'incident.opened',
        'recommendation.requested',
        'recommendation.generated',
        'action.approved',
        'action.executed',
      ]),
    );
    expect(incidentDetail.app?.status).toBe('blocked');

    const verification = await request(app).get('/api/audit/verify').set(auditorHeader).expect(200);
    expect(verification.body.isValid).toBe(true);
  });

  it('enforces the two-person rule on a Critical app review', async () => {
    const { app } = createCockpitApp({ environment: offlineEnvironment });
    const detection = await request(app)
      .post('/api/telemetry/simulate')
      .set(leadHeader)
      .send({ scenario: 'oauth-agent' })
      .expect(201);
    expect(detection.body.app.risk.tier).toBe('Critical');
    expect(detection.body.incident.severity).toBe('critical');
    const reviewId: string = detection.body.review.id;

    const first = await request(app)
      .post(`/api/reviews/${reviewId}/decisions`)
      .set(analystHeader)
      .send({ decision: 'block', rationale: 'Mailbox write scopes with no SOC 2.' })
      .expect(200);
    expect(first.body.review.status).toBe('pending');

    await request(app)
      .post(`/api/reviews/${reviewId}/decisions`)
      .set({ 'x-demo-user-id': 'user-jordan' })
      .send({ decision: 'block', rationale: 'Agreed, block the agent entirely.' })
      .expect(403);

    const second = await request(app)
      .post(`/api/reviews/${reviewId}/decisions`)
      .set(leadHeader)
      .send({ decision: 'restrict', rationale: 'Agree it cannot run with write scopes.' })
      .expect(200);
    expect(second.body.review).toMatchObject({ status: 'decided', outcome: 'block' });
    expect(second.body.app.status).toBe('blocked');
  });

  it('routes partial telemetry to a lead with low confidence and opens no incident', async () => {
    const { app } = createCockpitApp({ environment: offlineEnvironment });
    const detection = await request(app)
      .post('/api/telemetry/simulate')
      .set(analystHeader)
      .send({ scenario: 'partial-telemetry' })
      .expect(201);
    expect(detection.body.app.risk.confidence).toBe('low');
    expect(detection.body.review.routedToRole).toBe('lead');
    expect(detection.body.incident).toBeNull();
  });

  it('lets an employee report an AI app but not view security data', async () => {
    const { app } = createCockpitApp({ environment: offlineEnvironment });
    await request(app)
      .post('/api/apps/report')
      .set(employeeHeader)
      .send({ appName: 'SlideMagic', domain: 'slidemagic.example', purpose: 'Turning notes into slides' })
      .expect(201);
    await request(app).get('/api/apps').set(employeeHeader).expect(403);
    const reviews = await request(app).get('/api/reviews').set(leadHeader).expect(200);
    expect((reviews.body as ReviewWithApp[]).some(({ app: reviewedApp }) => reviewedApp.name === 'SlideMagic')).toBe(true);
  });

  it('rejects requests without a known user', async () => {
    const { app } = createCockpitApp({ environment: offlineEnvironment });
    await request(app).get('/api/overview').expect(401);
  });
});

describe('Azure OpenAI recommendations', () => {
  const azureEnvironment = {
    AZURE_OPENAI_ENDPOINT: 'https://cockpit-test.openai.azure.com/',
    AZURE_OPENAI_API_KEY: 'test-key',
    AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
  } as NodeJS.ProcessEnv;

  it('sends only redacted context and drops actions outside the allowlist', async () => {
    const requestBodies: string[] = [];
    const fetchImplementation = (async (_url: string, init?: RequestInit) => {
      requestBodies.push(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summary: 'PHI went to an unsanctioned summarizer.',
                  reasoning: ['Regulated data left the tenant.'],
                  confidence: 'medium',
                  actions: [
                    { kind: 'block-app', description: 'Block the domain.' },
                    { kind: 'wipe-laptop', description: 'Not allowed.' },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    const { app } = createCockpitApp({ environment: azureEnvironment, fetchImplementation });
    const detection = await request(app)
      .post('/api/telemetry/simulate')
      .set(analystHeader)
      .send({ scenario: 'unsanctioned-pdf-tool' });
    const response = await request(app)
      .post(`/api/incidents/${detection.body.incident.id}/recommendation`)
      .set(analystHeader)
      .expect(201);
    expect(response.body.recommendation.provider).toBe('azure-openai');
    expect(response.body.recommendation.proposedActions.map(({ kind }: { kind: string }) => kind)).toEqual(['block-app']);
    expect(requestBodies.join('')).not.toMatch(/123-45-6789|jane\.doe|448192031/);
  });

  it('falls back to the rules engine when Azure OpenAI fails', async () => {
    const fetchImplementation = (async () => new Response('busy', { status: 429 })) as typeof fetch;
    const { app } = createCockpitApp({ environment: azureEnvironment, fetchImplementation });
    const detection = await request(app)
      .post('/api/telemetry/simulate')
      .set(analystHeader)
      .send({ scenario: 'unsanctioned-pdf-tool' });
    const response = await request(app)
      .post(`/api/incidents/${detection.body.incident.id}/recommendation`)
      .set(analystHeader)
      .expect(201);
    expect(response.body.recommendation.provider).toBe('rules-engine');
    expect(response.body.recommendation.fallbackReason).toContain('HTTP 429');
  });
});
