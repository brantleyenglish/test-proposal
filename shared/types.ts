export type Role = 'employee' | 'analyst' | 'lead' | 'auditor';

export type DemoUser = {
  id: string;
  name: string;
  title: string;
  role: Role;
};

export type TelemetrySource =
  | 'defender-cloud-apps'
  | 'entra-id'
  | 'secure-web-gateway'
  | 'purview-dlp'
  | 'browser-extension'
  | 'employee-report';

export type DataSensitivity = 'none' | 'internal' | 'confidential' | 'regulated';

export type AccountType = 'corporate' | 'personal';

export type TelemetryEvent = {
  id: string;
  source: TelemetrySource;
  observedAt: string;
  domain: string;
  appName?: string;
  category?: string;
  pseudonymousUserId?: string;
  department?: string;
  dataSensitivity?: DataSensitivity;
  uploadedBytes?: number;
  accountType?: AccountType;
  oauthScopes?: string[];
  vendorTrainsOnCustomerData?: boolean;
  vendorHasSoc2?: boolean;
  vendorSupportsSso?: boolean;
  note?: string;
};

export type TelemetryEventInput = Omit<TelemetryEvent, 'id' | 'observedAt'> & {
  observedAt?: string;
};

export type RiskTier = 'Low' | 'Moderate' | 'High' | 'Critical';

export type AssessmentConfidence = 'high' | 'medium' | 'low';

export type RiskFactor = {
  key: string;
  label: string;
  points: number;
  maxPoints: number;
  rationale: string;
  isEstimated: boolean;
};

export type RiskAssessment = {
  score: number;
  tier: RiskTier;
  confidence: AssessmentConfidence;
  factors: RiskFactor[];
  missingSignals: string[];
};

export type AppStatus = 'in-review' | 'approved' | 'restricted' | 'blocked';

export type AiApp = {
  id: string;
  name: string;
  domain: string;
  category: string;
  status: AppStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  sources: TelemetrySource[];
  pseudonymousUserIds: string[];
  departments: string[];
  dataSensitivities: DataSensitivity[];
  accountTypes: AccountType[];
  oauthScopes: string[];
  vendorTrainsOnCustomerData: boolean | null;
  vendorHasSoc2: boolean | null;
  vendorSupportsSso: boolean | null;
  eventCount: number;
  risk: RiskAssessment;
};

export type AppDecision = 'approve' | 'restrict' | 'block';

export type ReviewDecision = {
  userId: string;
  userName: string;
  userRole: Role;
  decision: AppDecision;
  rationale: string;
  decidedAt: string;
};

export type Review = {
  id: string;
  appId: string;
  createdAt: string;
  slaDueAt: string;
  routedToRole: Role;
  routingReason: string;
  requiredApprovals: number;
  status: 'pending' | 'decided';
  decisions: ReviewDecision[];
  outcome: AppDecision | null;
};

export type ActionKind =
  | 'block-app'
  | 'revoke-oauth-grant'
  | 'notify-user'
  | 'add-dlp-rule'
  | 'open-ticket';

export type ActionImpact = 'operational' | 'containment';

export type ActionApproval = {
  userId: string;
  userName: string;
  verdict: 'approve' | 'reject';
  rationale: string;
  decidedAt: string;
};

export type ProposedAction = {
  id: string;
  kind: ActionKind;
  description: string;
  impact: ActionImpact;
  requiredRole: Role;
  status: 'awaiting-approval' | 'rejected' | 'executed';
  approval: ActionApproval | null;
  executionResult: string | null;
  executedAt: string | null;
};

export type RecommendationProvider = 'azure-openai' | 'rules-engine';

export type Recommendation = {
  id: string;
  generatedAt: string;
  provider: RecommendationProvider;
  model: string;
  summary: string;
  reasoning: string[];
  confidence: AssessmentConfidence;
  redactionCount: number;
  fallbackReason: string | null;
  proposedActions: ProposedAction[];
};

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus = 'new' | 'awaiting-approval' | 'contained' | 'closed';

export type Incident = {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  createdAt: string;
  appId: string | null;
  signals: string[];
  ingestRedactionCount: number;
  recommendation: Recommendation | null;
};

export type AuditActorType = 'user' | 'system' | 'ai';

export type AuditEntityType =
  | 'telemetry'
  | 'app'
  | 'review'
  | 'incident'
  | 'recommendation'
  | 'action'
  | 'system';

export type AuditEntry = {
  sequence: number;
  at: string;
  actorType: AuditActorType;
  actorId: string;
  actorName: string;
  action: string;
  entityType: AuditEntityType;
  entityId: string;
  relatedIds: string[];
  details: Record<string, string | number | boolean | null>;
  previousHash: string;
  hash: string;
};

export type AuditVerification = {
  isValid: boolean;
  entryCount: number;
  brokenAtSequence: number | null;
  headHash: string | null;
};

export type TelemetryCoverage = {
  source: TelemetrySource;
  eventCount: number;
  completeEventCount: number;
};

export type Overview = {
  appCount: number;
  unsanctionedAppCount: number;
  pendingReviewCount: number;
  openIncidentCount: number;
  actionsAwaitingApprovalCount: number;
  tierCounts: Record<RiskTier, number>;
  telemetryCoverage: TelemetryCoverage[];
  auditVerification: AuditVerification;
};

export type AppDetail = {
  app: AiApp;
  review: Review | null;
  auditHistory: AuditEntry[];
};

export type IncidentDetail = {
  incident: Incident;
  app: AiApp | null;
  auditHistory: AuditEntry[];
};

export type ReviewWithApp = Review & { app: AiApp };

export type SimulationScenario = 'unsanctioned-pdf-tool' | 'oauth-agent' | 'partial-telemetry';

export type CockpitConfig = {
  recommendationProvider: RecommendationProvider;
  model: string;
  simulatedConnectors: boolean;
};
