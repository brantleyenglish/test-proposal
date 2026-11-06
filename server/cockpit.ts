import type {
  AiApp,
  AppDecision,
  AppDetail,
  AppStatus,
  AuditEntry,
  DemoUser,
  Incident,
  IncidentDetail,
  IncidentSeverity,
  Overview,
  ProposedAction,
  Recommendation,
  Review,
  ReviewWithApp,
  RiskTier,
  TelemetryCoverage,
  TelemetryEvent,
  TelemetryEventInput,
  TelemetrySource,
} from '../shared/types';
import { appendAuditEntry, getEntityHistory, verifyAuditChain, type AuditEntryInput } from './auditLog';
import { canDecideAction, canDecideReview, hasPermission, type Permission } from './authorization';
import { actionPolicies, executeSimulatedAction } from './connectors';
import {
  buildIncidentContext,
  buildRuleBasedRecommendation,
  generateAzureOpenAiRecommendation,
  type AzureOpenAiConfig,
  type RecommendationDraft,
} from './recommendations';
import { redactSensitiveText } from './redaction';
import { assessRisk, routeReview } from './riskScoring';

export type CockpitState = {
  users: DemoUser[];
  telemetry: TelemetryEvent[];
  apps: AiApp[];
  reviews: Review[];
  incidents: Incident[];
  auditLog: AuditEntry[];
  nextId: number;
};

export class CockpitError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export const createEmptyState = (users: DemoUser[]): CockpitState => ({
  users,
  telemetry: [],
  apps: [],
  reviews: [],
  incidents: [],
  auditLog: [],
  nextId: 1,
});

const createId = ({ state, prefix }: { state: CockpitState; prefix: string }) => {
  const id = `${prefix}-${String(state.nextId).padStart(4, '0')}`;
  state.nextId += 1;
  return id;
};

const audit = ({ state, input }: { state: CockpitState; input: AuditEntryInput }) =>
  appendAuditEntry({ log: state.auditLog, input });

const userActor = (user: DemoUser) => ({
  actorType: 'user' as const,
  actorId: user.id,
  actorName: `${user.name} (${user.role})`,
});

const systemActor = { actorType: 'system' as const, actorId: 'cockpit', actorName: 'Cockpit engine' };

export const requirePermission = ({ user, permission }: { user: DemoUser; permission: Permission }) => {
  if (!hasPermission({ user, permission })) {
    throw new CockpitError(`The ${user.role} role is not allowed to ${permission.replace(/-/g, ' ')}.`, 403);
  }
};

const requireRationale = (rationale: string) => {
  if (rationale.trim().length < 15) {
    throw new CockpitError('A rationale of at least 15 characters is required for every decision.', 400);
  }
};

const unique = <Item>(items: Item[]) => [...new Set(items)];

const getPendingReviewForApp = ({ state, appId }: { state: CockpitState; appId: string }) =>
  state.reviews.find((review) => review.appId === appId && review.status === 'pending') ?? null;

const findApp = ({ state, appId }: { state: CockpitState; appId: string | null }) =>
  state.apps.find((app) => app.id === appId) ?? null;

const writeScopePattern = /(send|write|readwrite|manage|full_access)/i;

const getIncidentTrigger = ({ event, app }: { event: TelemetryEvent; app: AiApp }) => {
  if (app.status === 'approved') {
    return null;
  }
  const writeScopes = (event.oauthScopes ?? []).filter((scope) => writeScopePattern.test(scope));
  if (writeScopes.length) {
    return {
      title: `Unsanctioned AI agent ${app.name} granted write access to corporate data`,
      severity: 'critical' as IncidentSeverity,
    };
  }
  if (event.dataSensitivity === 'regulated') {
    return {
      title: `Regulated data uploaded to unsanctioned AI app ${app.name}`,
      severity: 'high' as IncidentSeverity,
    };
  }
  return null;
};

const describeEvent = (event: TelemetryEvent) =>
  [
    `${event.source} observed ${event.domain}`,
    event.pseudonymousUserId ? `user ${event.pseudonymousUserId}` : 'user unknown',
    event.department ? `department ${event.department}` : null,
    event.dataSensitivity ? `data classified ${event.dataSensitivity}` : 'data classification unknown',
    event.uploadedBytes ? `${(event.uploadedBytes / 1_048_576).toFixed(1)} MB uploaded` : null,
    event.accountType ? `${event.accountType} account` : null,
    event.oauthScopes?.length ? `OAuth scopes ${event.oauthScopes.join(', ')}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join('; ');

const createAppFromEvent = ({ state, event }: { state: CockpitState; event: TelemetryEvent }): AiApp => {
  const baseApp = {
    id: createId({ state, prefix: 'app' }),
    name: event.appName ?? event.domain,
    domain: event.domain,
    category: event.category ?? 'Uncategorized AI',
    status: 'in-review' as AppStatus,
    firstSeenAt: event.observedAt,
    lastSeenAt: event.observedAt,
    sources: [],
    pseudonymousUserIds: [],
    departments: [],
    dataSensitivities: [],
    accountTypes: [],
    oauthScopes: [],
    vendorTrainsOnCustomerData: null,
    vendorHasSoc2: null,
    vendorSupportsSso: null,
    eventCount: 0,
  };
  return { ...baseApp, risk: assessRisk(baseApp) };
};

const mergeEventIntoApp = ({ app, event }: { app: AiApp; event: TelemetryEvent }) => {
  app.name = app.name === app.domain && event.appName ? event.appName : app.name;
  app.category = app.category === 'Uncategorized AI' && event.category ? event.category : app.category;
  app.lastSeenAt = event.observedAt > app.lastSeenAt ? event.observedAt : app.lastSeenAt;
  app.sources = unique([...app.sources, event.source]);
  app.pseudonymousUserIds = unique([...app.pseudonymousUserIds, ...(event.pseudonymousUserId ? [event.pseudonymousUserId] : [])]);
  app.departments = unique([...app.departments, ...(event.department ? [event.department] : [])]);
  app.dataSensitivities = unique([...app.dataSensitivities, ...(event.dataSensitivity ? [event.dataSensitivity] : [])]);
  app.accountTypes = unique([...app.accountTypes, ...(event.accountType ? [event.accountType] : [])]);
  app.oauthScopes = unique([...app.oauthScopes, ...(event.oauthScopes ?? [])]);
  app.vendorTrainsOnCustomerData = event.vendorTrainsOnCustomerData ?? app.vendorTrainsOnCustomerData;
  app.vendorHasSoc2 = event.vendorHasSoc2 ?? app.vendorHasSoc2;
  app.vendorSupportsSso = event.vendorSupportsSso ?? app.vendorSupportsSso;
  app.eventCount += 1;
  app.risk = assessRisk(app);
};

const recordEvent = ({ state, input }: { state: CockpitState; input: TelemetryEventInput }) => {
  const redactedNote = input.note ? redactSensitiveText(input.note) : null;
  const event: TelemetryEvent = {
    ...input,
    domain: input.domain.trim().toLowerCase(),
    id: createId({ state, prefix: 'evt' }),
    observedAt: input.observedAt ?? new Date().toISOString(),
    note: redactedNote?.text,
  };
  state.telemetry.push(event);
  return { event, redactionCount: redactedNote?.redactionCount ?? 0 };
};

const upsertAppFromEvent = ({ state, event }: { state: CockpitState; event: TelemetryEvent }) => {
  const existingApp = state.apps.find((app) => app.domain === event.domain);
  const app = existingApp ?? createAppFromEvent({ state, event });
  if (!existingApp) {
    state.apps.push(app);
  }
  mergeEventIntoApp({ app, event });
  return { app, isNewApp: !existingApp };
};

type AuditAssessmentParams = {
  state: CockpitState;
  app: AiApp;
  isNewApp: boolean;
  previousTier: RiskTier | null;
  relatedIds: string[];
  at: string;
};

const auditAssessment = ({ state, app, isNewApp, previousTier, relatedIds, at }: AuditAssessmentParams) =>
  audit({
    state,
    input: {
      ...systemActor,
      action: isNewApp ? 'app.discovered' : 'app.reassessed',
      entityType: 'app',
      entityId: app.id,
      relatedIds,
      details: {
        name: app.name,
        domain: app.domain,
        score: app.risk.score,
        tier: app.risk.tier,
        previousTier,
        confidence: app.risk.confidence,
        missingSignals: app.risk.missingSignals.join(', ') || null,
      },
      at,
    },
  });

type IngestTelemetryParams = {
  state: CockpitState;
  input: TelemetryEventInput;
  actor: DemoUser | null;
};

export const ingestTelemetry = ({ state, input, actor }: IngestTelemetryParams) => {
  const { event, redactionCount } = recordEvent({ state, input });
  audit({
    state,
    input: {
      ...(actor ? userActor(actor) : systemActor),
      action: 'telemetry.ingested',
      entityType: 'telemetry',
      entityId: event.id,
      relatedIds: [],
      details: {
        source: event.source,
        domain: event.domain,
        dataSensitivity: event.dataSensitivity ?? null,
        redactionsAtIngest: redactionCount,
      },
      at: event.observedAt,
    },
  });
  const previousTier = state.apps.find((app) => app.domain === event.domain)?.risk.tier ?? null;
  const { app, isNewApp } = upsertAppFromEvent({ state, event });
  auditAssessment({ state, app, isNewApp, previousTier, relatedIds: [event.id], at: event.observedAt });
  const review = app.status === 'in-review' ? routeAppForReview({ state, app, at: event.observedAt }) : null;
  const incident = openIncidentIfNeeded({ state, event, app, redactionCount });
  return { event, app, review, incident };
};

type IngestTelemetryBatchParams = {
  state: CockpitState;
  inputs: TelemetryEventInput[];
  connectorName: string;
};

export const ingestTelemetryBatch = ({ state, inputs, connectorName }: IngestTelemetryBatchParams) => {
  const recordedEvents = inputs.map((input) => recordEvent({ state, input }));
  const lastObservedAt = recordedEvents.reduce(
    (latest, { event }) => (event.observedAt > latest ? event.observedAt : latest),
    '',
  );
  const batchEntry = audit({
    state,
    input: {
      ...systemActor,
      action: 'telemetry.batch-ingested',
      entityType: 'telemetry',
      entityId: `batch-${state.nextId}`,
      relatedIds: [],
      details: {
        connector: connectorName,
        eventCount: recordedEvents.length,
        domains: unique(recordedEvents.map(({ event }) => event.domain)).join(', '),
      },
      at: lastObservedAt || undefined,
    },
  });
  const domains = unique(recordedEvents.map(({ event }) => event.domain));
  return domains.map((domain) => {
    const domainEvents = recordedEvents.filter(({ event }) => event.domain === domain);
    const previousTier = state.apps.find((app) => app.domain === domain)?.risk.tier ?? null;
    const upserts = domainEvents.map(({ event }) => upsertAppFromEvent({ state, event }));
    const app = upserts[0]?.app;
    if (!app) {
      return null;
    }
    const isNewApp = upserts.some(({ isNewApp: wasCreated }) => wasCreated);
    auditAssessment({ state, app, isNewApp, previousTier, relatedIds: [batchEntry.entityId], at: batchEntry.at });
    const review = app.status === 'in-review' ? routeAppForReview({ state, app, at: batchEntry.at }) : null;
    const incidents = domainEvents
      .map(({ event, redactionCount }) => openIncidentIfNeeded({ state, event, app, redactionCount }))
      .filter((incident): incident is Incident => incident !== null);
    return { app, review, incidents };
  });
};

const routeAppForReview = ({ state, app, at }: { state: CockpitState; app: AiApp; at: string }) => {
  const routing = routeReview(app.risk);
  const pendingReview = getPendingReviewForApp({ state, appId: app.id });
  if (pendingReview) {
    const isStricter =
      routing.requiredApprovals > pendingReview.requiredApprovals ||
      (routing.routedToRole === 'lead' && pendingReview.routedToRole !== 'lead');
    if (isStricter && pendingReview.decisions.length === 0) {
      pendingReview.routedToRole = routing.routedToRole;
      pendingReview.requiredApprovals = routing.requiredApprovals;
      pendingReview.routingReason = routing.routingReason;
      audit({
        state,
        input: {
          ...systemActor,
          action: 'review.rerouted',
          entityType: 'review',
          entityId: pendingReview.id,
          relatedIds: [app.id],
          details: { routedToRole: routing.routedToRole, requiredApprovals: routing.requiredApprovals, reason: routing.routingReason },
          at,
        },
      });
    }
    return pendingReview;
  }
  const review: Review = {
    id: createId({ state, prefix: 'rev' }),
    appId: app.id,
    createdAt: at,
    slaDueAt: new Date(new Date(at).getTime() + routing.slaDays * 86_400_000).toISOString(),
    routedToRole: routing.routedToRole,
    routingReason: routing.routingReason,
    requiredApprovals: routing.requiredApprovals,
    status: 'pending',
    decisions: [],
    outcome: null,
  };
  state.reviews.push(review);
  audit({
    state,
    input: {
      ...systemActor,
      action: 'review.routed',
      entityType: 'review',
      entityId: review.id,
      relatedIds: [app.id],
      details: {
        routedToRole: review.routedToRole,
        requiredApprovals: review.requiredApprovals,
        slaDueAt: review.slaDueAt,
        reason: review.routingReason,
        enforcement: 'none until a human decides',
      },
      at,
    },
  });
  return review;
};

type OpenIncidentParams = { state: CockpitState; event: TelemetryEvent; app: AiApp; redactionCount: number };

const openIncidentIfNeeded = ({ state, event, app, redactionCount }: OpenIncidentParams) => {
  const trigger = getIncidentTrigger({ event, app });
  const hasOpenIncident = state.incidents.some(
    (incident) => incident.appId === app.id && incident.status !== 'closed' && incident.status !== 'contained',
  );
  if (!trigger || hasOpenIncident) {
    return null;
  }
  const incident: Incident = {
    id: createId({ state, prefix: 'inc' }),
    title: trigger.title,
    severity: trigger.severity,
    status: 'new',
    createdAt: event.observedAt,
    appId: app.id,
    signals: [describeEvent(event), ...(event.note ? [`Detail: ${event.note}`] : [])],
    ingestRedactionCount: redactionCount,
    recommendation: null,
  };
  state.incidents.push(incident);
  audit({
    state,
    input: {
      ...systemActor,
      action: 'incident.opened',
      entityType: 'incident',
      entityId: incident.id,
      relatedIds: [app.id, event.id],
      details: { title: incident.title, severity: incident.severity },
      at: event.observedAt,
    },
  });
  return incident;
};

const decisionSeverity: Record<AppDecision, number> = { approve: 0, restrict: 1, block: 2 };

const statusByDecision: Record<AppDecision, AppStatus> = {
  approve: 'approved',
  restrict: 'restricted',
  block: 'blocked',
};

type DecideReviewParams = {
  state: CockpitState;
  user: DemoUser;
  reviewId: string;
  decision: AppDecision;
  rationale: string;
};

export const decideReview = ({ state, user, reviewId, decision, rationale }: DecideReviewParams) => {
  const review = state.reviews.find((candidate) => candidate.id === reviewId);
  if (!review) {
    throw new CockpitError('Review not found.', 404);
  }
  requireRationale(rationale);
  const authorization = canDecideReview({ user, review });
  if (!authorization.isAllowed) {
    throw new CockpitError(authorization.reason, 403);
  }
  const app = findApp({ state, appId: review.appId });
  if (!app) {
    throw new CockpitError('The app for this review no longer exists.', 404);
  }
  review.decisions.push({
    userId: user.id,
    userName: user.name,
    userRole: user.role,
    decision,
    rationale: rationale.trim(),
    decidedAt: new Date().toISOString(),
  });
  audit({
    state,
    input: {
      ...userActor(user),
      action: 'review.decision-recorded',
      entityType: 'review',
      entityId: review.id,
      relatedIds: [app.id],
      details: {
        decision,
        rationale: rationale.trim(),
        approvalsRecorded: review.decisions.length,
        approvalsRequired: review.requiredApprovals,
      },
    },
  });
  if (review.decisions.length < review.requiredApprovals) {
    return { review, app };
  }
  const outcome = review.decisions.reduce<AppDecision>(
    (strictest, { decision: candidate }) =>
      decisionSeverity[candidate] > decisionSeverity[strictest] ? candidate : strictest,
    'approve',
  );
  review.status = 'decided';
  review.outcome = outcome;
  const previousStatus = app.status;
  app.status = statusByDecision[outcome];
  audit({
    state,
    input: {
      ...systemActor,
      action: 'app.status-changed',
      entityType: 'app',
      entityId: app.id,
      relatedIds: [review.id],
      details: {
        from: previousStatus,
        to: app.status,
        decidedBy: review.decisions.map(({ userName }) => userName).join(' + '),
        policySync: `[Simulated Defender for Cloud Apps] ${app.domain} tagged ${app.status === 'approved' ? 'Sanctioned' : 'Unsanctioned or Monitored'}`,
      },
    },
  });
  return { review, app };
};

type GenerateRecommendationParams = {
  state: CockpitState;
  user: DemoUser;
  incidentId: string;
  azureConfig: AzureOpenAiConfig | null;
  fetchImplementation?: typeof fetch;
};

const toProposedActions = ({ state, draft }: { state: CockpitState; draft: RecommendationDraft }): ProposedAction[] =>
  draft.actions.map(({ kind, description }) => ({
    id: createId({ state, prefix: 'act' }),
    kind,
    description,
    impact: actionPolicies[kind].impact,
    requiredRole: actionPolicies[kind].requiredRole,
    status: 'awaiting-approval',
    approval: null,
    executionResult: null,
    executedAt: null,
  }));

export const generateRecommendation = async ({
  state,
  user,
  incidentId,
  azureConfig,
  fetchImplementation,
}: GenerateRecommendationParams) => {
  requirePermission({ user, permission: 'generate-recommendation' });
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) {
    throw new CockpitError('Incident not found.', 404);
  }
  const hasDecidedActions = incident.recommendation?.proposedActions.some(
    (action) => action.status !== 'awaiting-approval',
  );
  if (hasDecidedActions) {
    throw new CockpitError('Actions from the current recommendation were already decided; it cannot be replaced.', 409);
  }
  const app = findApp({ state, appId: incident.appId });
  const context = buildIncidentContext({ incident, app });
  audit({
    state,
    input: {
      ...userActor(user),
      action: 'recommendation.requested',
      entityType: 'incident',
      entityId: incident.id,
      relatedIds: app ? [app.id] : [],
      details: { redactionsBeforeModel: context.redactionCount, provider: azureConfig ? 'azure-openai' : 'rules-engine' },
    },
  });
  const { draft, fallbackReason } = await draftRecommendation({ incident, app, azureConfig, contextText: context.text, fetchImplementation });
  const recommendation: Recommendation = {
    id: createId({ state, prefix: 'rec' }),
    generatedAt: new Date().toISOString(),
    provider: draft.provider,
    model: draft.model,
    summary: draft.summary,
    reasoning: draft.reasoning,
    confidence: draft.confidence,
    redactionCount: context.redactionCount,
    fallbackReason,
    proposedActions: toProposedActions({ state, draft }),
  };
  incident.recommendation = recommendation;
  incident.status = 'awaiting-approval';
  audit({
    state,
    input: {
      actorType: 'ai',
      actorId: recommendation.provider,
      actorName: `${recommendation.provider === 'azure-openai' ? 'Azure OpenAI' : 'Rules engine'} (${recommendation.model})`,
      action: 'recommendation.generated',
      entityType: 'recommendation',
      entityId: recommendation.id,
      relatedIds: [incident.id, ...(app ? [app.id] : [])],
      details: {
        summary: recommendation.summary,
        confidence: recommendation.confidence,
        proposedActions: recommendation.proposedActions.map(({ kind }) => kind).join(', '),
        fallbackReason,
        executed: 'nothing: every action awaits human approval',
      },
    },
  });
  return { incident, recommendation };
};

type DraftRecommendationParams = {
  incident: Incident;
  app: AiApp | null;
  azureConfig: AzureOpenAiConfig | null;
  contextText: string;
  fetchImplementation?: typeof fetch;
};

const draftRecommendation = async ({
  incident,
  app,
  azureConfig,
  contextText,
  fetchImplementation,
}: DraftRecommendationParams): Promise<{ draft: RecommendationDraft; fallbackReason: string | null }> => {
  if (!azureConfig) {
    return { draft: buildRuleBasedRecommendation({ incident, app }), fallbackReason: null };
  }
  try {
    const draft = await generateAzureOpenAiRecommendation({
      incident,
      app,
      config: azureConfig,
      contextText,
      fetchImplementation,
    });
    return { draft, fallbackReason: null };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    return {
      draft: buildRuleBasedRecommendation({ incident, app }),
      fallbackReason: `Azure OpenAI unavailable (${reason}); used the rules engine instead.`,
    };
  }
};

type DecideActionParams = {
  state: CockpitState;
  user: DemoUser;
  incidentId: string;
  actionId: string;
  verdict: 'approve' | 'reject';
  rationale: string;
};

export const decideAction = ({ state, user, incidentId, actionId, verdict, rationale }: DecideActionParams) => {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  const action = incident?.recommendation?.proposedActions.find((candidate) => candidate.id === actionId);
  if (!incident || !action) {
    throw new CockpitError('Action not found.', 404);
  }
  if (action.status !== 'awaiting-approval') {
    throw new CockpitError('This action was already decided.', 409);
  }
  requireRationale(rationale);
  const authorization = canDecideAction({ user, requiredRole: action.requiredRole });
  if (!authorization.isAllowed) {
    throw new CockpitError(authorization.reason, 403);
  }
  const app = findApp({ state, appId: incident.appId });
  action.approval = {
    userId: user.id,
    userName: user.name,
    verdict,
    rationale: rationale.trim(),
    decidedAt: new Date().toISOString(),
  };
  audit({
    state,
    input: {
      ...userActor(user),
      action: verdict === 'approve' ? 'action.approved' : 'action.rejected',
      entityType: 'action',
      entityId: action.id,
      relatedIds: [incident.id, incident.recommendation?.id ?? '', ...(app ? [app.id] : [])].filter(Boolean),
      details: { kind: action.kind, impact: action.impact, rationale: rationale.trim() },
    },
  });
  if (verdict === 'reject') {
    action.status = 'rejected';
  }
  if (verdict === 'approve') {
    executeApprovedAction({ state, incident, action, app });
  }
  const isFullyDecided = incident.recommendation?.proposedActions.every(
    (candidate) => candidate.status !== 'awaiting-approval',
  );
  if (isFullyDecided) {
    incident.status = 'contained';
    audit({
      state,
      input: {
        ...systemActor,
        action: 'incident.contained',
        entityType: 'incident',
        entityId: incident.id,
        relatedIds: app ? [app.id] : [],
        details: {
          executedActions: incident.recommendation?.proposedActions.filter(({ status }) => status === 'executed').length ?? 0,
          rejectedActions: incident.recommendation?.proposedActions.filter(({ status }) => status === 'rejected').length ?? 0,
        },
      },
    });
  }
  return { incident, action };
};

type ExecuteApprovedActionParams = {
  state: CockpitState;
  incident: Incident;
  action: ProposedAction;
  app: AiApp | null;
};

const executeApprovedAction = ({ state, incident, action, app }: ExecuteApprovedActionParams) => {
  action.status = 'executed';
  action.executedAt = new Date().toISOString();
  action.executionResult = executeSimulatedAction({ kind: action.kind, app, ticketNumber: 4100 + state.nextId });
  audit({
    state,
    input: {
      ...systemActor,
      action: 'action.executed',
      entityType: 'action',
      entityId: action.id,
      relatedIds: [incident.id, ...(app ? [app.id] : [])],
      details: { kind: action.kind, result: action.executionResult, simulated: true },
    },
  });
  if (action.kind === 'block-app' && app) {
    const previousStatus = app.status;
    app.status = 'blocked';
    audit({
      state,
      input: {
        ...systemActor,
        action: 'app.status-changed',
        entityType: 'app',
        entityId: app.id,
        relatedIds: [incident.id, action.id],
        details: { from: previousStatus, to: 'blocked', reason: 'Containment action approved during incident triage' },
      },
    });
  }
};

const tiers: RiskTier[] = ['Low', 'Moderate', 'High', 'Critical'];

const sourcesInOrder: TelemetrySource[] = [
  'defender-cloud-apps',
  'entra-id',
  'secure-web-gateway',
  'purview-dlp',
  'browser-extension',
  'employee-report',
];

const isCompleteEvent = (event: TelemetryEvent) =>
  Boolean(event.pseudonymousUserId && event.dataSensitivity && event.accountType);

export const getOverview = (state: CockpitState): Overview => ({
  appCount: state.apps.length,
  unsanctionedAppCount: state.apps.filter((app) => app.status !== 'approved').length,
  pendingReviewCount: state.reviews.filter((review) => review.status === 'pending').length,
  openIncidentCount: state.incidents.filter(
    (incident) => incident.status === 'new' || incident.status === 'awaiting-approval',
  ).length,
  actionsAwaitingApprovalCount: state.incidents.reduce(
    (total, incident) =>
      total +
      (incident.recommendation?.proposedActions.filter(({ status }) => status === 'awaiting-approval').length ?? 0),
    0,
  ),
  tierCounts: tiers.reduce<Record<RiskTier, number>>(
    (counts, tier) => ({ ...counts, [tier]: state.apps.filter((app) => app.risk.tier === tier).length }),
    { Low: 0, Moderate: 0, High: 0, Critical: 0 },
  ),
  telemetryCoverage: sourcesInOrder.map<TelemetryCoverage>((source) => {
    const events = state.telemetry.filter((event) => event.source === source);
    return { source, eventCount: events.length, completeEventCount: events.filter(isCompleteEvent).length };
  }),
  auditVerification: verifyAuditChain(state.auditLog),
});

export const getAppDetail = ({ state, appId }: { state: CockpitState; appId: string }): AppDetail => {
  const app = findApp({ state, appId });
  if (!app) {
    throw new CockpitError('App not found.', 404);
  }
  const review =
    getPendingReviewForApp({ state, appId }) ?? state.reviews.findLast((candidate) => candidate.appId === appId) ?? null;
  return { app, review, auditHistory: getEntityHistory({ log: state.auditLog, entityIds: [app.id] }) };
};

export const getIncidentDetail = ({ state, incidentId }: { state: CockpitState; incidentId: string }): IncidentDetail => {
  const incident = state.incidents.find((candidate) => candidate.id === incidentId);
  if (!incident) {
    throw new CockpitError('Incident not found.', 404);
  }
  const entityIds = [
    incident.id,
    ...(incident.recommendation ? [incident.recommendation.id] : []),
    ...(incident.recommendation?.proposedActions.map(({ id }) => id) ?? []),
  ];
  return {
    incident,
    app: findApp({ state, appId: incident.appId }),
    auditHistory: getEntityHistory({ log: state.auditLog, entityIds }),
  };
};

export const listReviews = (state: CockpitState): ReviewWithApp[] =>
  state.reviews
    .map((review) => {
      const app = findApp({ state, appId: review.appId });
      return app ? { ...review, app } : null;
    })
    .filter((review): review is ReviewWithApp => review !== null)
    .sort((first, second) => {
      if (first.status !== second.status) {
        return first.status === 'pending' ? -1 : 1;
      }
      return second.app.risk.score - first.app.risk.score;
    });
