import type { DemoUser, SimulationScenario, TelemetryEventInput } from '../shared/types';
import {
  createEmptyState,
  decideReview,
  ingestTelemetry,
  ingestTelemetryBatch,
  type CockpitState,
} from './cockpit';

export const demoUsers: DemoUser[] = [
  { id: 'user-alex', name: 'Alex Rivera', title: 'Claims specialist', role: 'employee' },
  { id: 'user-dana', name: 'Dana Lee', title: 'SOC analyst', role: 'analyst' },
  { id: 'user-jordan', name: 'Jordan Patel', title: 'SOC analyst', role: 'analyst' },
  { id: 'user-sam', name: 'Sam Okafor', title: 'Security operations lead', role: 'lead' },
  { id: 'user-riley', name: 'Riley Chen', title: 'GRC auditor', role: 'auditor' },
];

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const pseudonymousUsers = ({ prefix, count }: { prefix: string; count: number }) =>
  Array.from({ length: count }, (_, index) => `${prefix}-${(index * 7919 + 4099).toString(16)}`);

type SeedApp = {
  base: TelemetryEventInput;
  userCount: number;
  firstSeenDaysAgo: number;
};

const seedApps: SeedApp[] = [
  {
    base: {
      source: 'defender-cloud-apps',
      domain: 'm365copilot.corp.example',
      appName: 'Microsoft 365 Copilot',
      category: 'Productivity assistant',
      department: 'All',
      dataSensitivity: 'confidential',
      accountType: 'corporate',
      vendorTrainsOnCustomerData: false,
      vendorHasSoc2: true,
      vendorSupportsSso: true,
    },
    userCount: 140,
    firstSeenDaysAgo: 120,
  },
  {
    base: {
      source: 'entra-id',
      domain: 'aoai-chat.corp.example',
      appName: 'Internal Azure OpenAI chat',
      category: 'Internal assistant',
      department: 'All',
      dataSensitivity: 'internal',
      accountType: 'corporate',
      vendorTrainsOnCustomerData: false,
      vendorHasSoc2: true,
      vendorSupportsSso: true,
    },
    userCount: 60,
    firstSeenDaysAgo: 90,
  },
  {
    base: {
      source: 'defender-cloud-apps',
      domain: 'codeassist.example',
      appName: 'CodeAssist Business',
      category: 'Developer tools',
      department: 'Engineering',
      dataSensitivity: 'confidential',
      accountType: 'corporate',
      vendorTrainsOnCustomerData: false,
      vendorHasSoc2: true,
      vendorSupportsSso: true,
    },
    userCount: 45,
    firstSeenDaysAgo: 75,
  },
  {
    base: {
      source: 'secure-web-gateway',
      domain: 'omnichat.example',
      appName: 'OmniChat (consumer)',
      category: 'General assistant',
      department: 'Sales',
      dataSensitivity: 'confidential',
      accountType: 'personal',
      vendorTrainsOnCustomerData: true,
      vendorHasSoc2: false,
    },
    userCount: 38,
    firstSeenDaysAgo: 21,
  },
  {
    base: {
      source: 'entra-id',
      domain: 'meetminutes.example',
      appName: 'MeetMinutes AI',
      category: 'Meeting assistant',
      department: 'Customer success',
      dataSensitivity: 'confidential',
      accountType: 'corporate',
      oauthScopes: ['Calendars.Read', 'OnlineMeetings.Read'],
      vendorHasSoc2: true,
      vendorSupportsSso: false,
    },
    userCount: 12,
    firstSeenDaysAgo: 9,
  },
];

const seededDecisions: { domain: string; decision: 'approve' | 'restrict'; rationale: string }[] = [
  {
    domain: 'm365copilot.corp.example',
    decision: 'approve',
    rationale: 'Enterprise agreement with no-training terms; tenant data boundary confirmed.',
  },
  {
    domain: 'aoai-chat.corp.example',
    decision: 'approve',
    rationale: 'Internal deployment in our Azure subscription with private endpoints.',
  },
  {
    domain: 'codeassist.example',
    decision: 'restrict',
    rationale: 'Approved for engineering, excluding repositories tagged as regulated.',
  },
];

export const createSeededState = (): CockpitState => {
  const state = createEmptyState(demoUsers);
  const lead = demoUsers.find((user) => user.role === 'lead');
  seedApps.forEach(({ base, userCount, firstSeenDaysAgo }) => {
    ingestTelemetryBatch({
      state,
      connectorName: base.source,
      inputs: pseudonymousUsers({ prefix: base.domain.slice(0, 3), count: userCount }).map(
        (pseudonymousUserId, index) => ({
          ...base,
          pseudonymousUserId,
          observedAt: daysAgo(firstSeenDaysAgo - (index % firstSeenDaysAgo)),
        }),
      ),
    });
  });
  if (lead) {
    seededDecisions.forEach(({ domain, decision, rationale }) => {
      const app = state.apps.find((candidate) => candidate.domain === domain);
      const review = state.reviews.find((candidate) => candidate.appId === app?.id && candidate.status === 'pending');
      if (review) {
        decideReview({ state, user: lead, reviewId: review.id, decision, rationale });
      }
    });
  }
  ingestTelemetry({
    state,
    input: {
      source: 'browser-extension',
      domain: 'omnichat.example',
      pseudonymousUserId: 'emp-5c1d',
      department: 'Sales',
      dataSensitivity: 'regulated',
      accountType: 'personal',
      uploadedBytes: 182_000,
      note: 'Pasted a customer renewal list including card 4111 1111 1111 1111 and contact pat.lopez@contoso.example',
      observedAt: daysAgo(1),
    },
    actor: null,
  });
  return state;
};

export const simulationScenarios: Record<SimulationScenario, { label: string; event: TelemetryEventInput }> = {
  'unsanctioned-pdf-tool': {
    label: 'Claims PHI uploaded to an unknown PDF summarizer',
    event: {
      source: 'purview-dlp',
      domain: 'quicksummary.example',
      appName: 'QuickSummary PDF',
      category: 'Document AI',
      pseudonymousUserId: 'emp-9a3f',
      department: 'Claims',
      dataSensitivity: 'regulated',
      accountType: 'personal',
      uploadedBytes: 4_404_019,
      note: 'File claims_export_q3.pdf (MRN 448192031, member SSN 123-45-6789) uploaded by jane.doe@contoso.example',
    },
  },
  'oauth-agent': {
    label: 'AI email agent granted mailbox write access',
    event: {
      source: 'entra-id',
      domain: 'inboxpilot.example',
      appName: 'InboxPilot Agent',
      category: 'Autonomous agent',
      pseudonymousUserId: 'emp-77e2',
      department: 'Finance',
      dataSensitivity: 'confidential',
      accountType: 'corporate',
      oauthScopes: ['Mail.ReadWrite', 'Mail.Send', 'Calendars.ReadWrite'],
      vendorTrainsOnCustomerData: true,
      vendorHasSoc2: false,
      vendorSupportsSso: false,
    },
  },
  'partial-telemetry': {
    label: 'Unknown AI API seen by the gateway only',
    event: {
      source: 'secure-web-gateway',
      domain: 'api.genwave.example',
      uploadedBytes: 61_440,
    },
  },
};
