import { z } from 'zod';

import type {
  ActionKind,
  AiApp,
  AssessmentConfidence,
  Incident,
  RecommendationProvider,
} from '../shared/types';
import { allowedActionKinds, isActionApplicable } from './connectors';
import { redactAll } from './redaction';

export type RecommendationDraft = {
  provider: RecommendationProvider;
  model: string;
  summary: string;
  reasoning: string[];
  confidence: AssessmentConfidence;
  actions: { kind: ActionKind; description: string }[];
};

export type AzureOpenAiConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
};

export const readAzureOpenAiConfig = (environment: NodeJS.ProcessEnv): AzureOpenAiConfig | null => {
  const endpoint = environment.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = environment.AZURE_OPENAI_API_KEY?.trim();
  const deployment = environment.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (!endpoint || !apiKey || !deployment) {
    return null;
  }
  return {
    endpoint: endpoint.replace(/\/+$/, ''),
    apiKey,
    deployment,
    apiVersion: environment.AZURE_OPENAI_API_VERSION?.trim() || '2024-10-21',
  };
};

type RecommendationContext = { incident: Incident; app: AiApp | null };

export const buildIncidentContext = ({ incident, app }: RecommendationContext) => {
  const appLines = app
    ? [
        `AI app: ${app.name} (${app.domain}), category ${app.category}`,
        `Governance status: ${app.status}`,
        `Risk: ${app.risk.score}/100, ${app.risk.tier} tier, ${app.risk.confidence} confidence`,
        `Missing telemetry: ${app.risk.missingSignals.join(', ') || 'none'}`,
        `Telemetry sources: ${app.sources.join(', ')}`,
        `Distinct users: ${app.pseudonymousUserIds.length}; account types: ${app.accountTypes.join(', ') || 'unknown'}`,
        `OAuth scopes granted: ${app.oauthScopes.join(', ') || 'none observed'}`,
        `Data classifications observed: ${app.dataSensitivities.join(', ') || 'unknown'}`,
      ]
    : ['AI app: unknown'];
  const contextLines = [
    `Incident: ${incident.title} (severity ${incident.severity})`,
    ...incident.signals.map((signal) => `Signal: ${signal}`),
    ...appLines,
  ];
  const redactedLines = redactAll(contextLines);
  return {
    text: redactedLines.map(({ text }) => text).join('\n'),
    redactionCount: redactedLines.reduce((total, { redactionCount }) => total + redactionCount, 0),
  };
};

const getConfidence = (app: AiApp | null): AssessmentConfidence => app?.risk.confidence ?? 'low';

export const buildRuleBasedRecommendation = ({ incident, app }: RecommendationContext): RecommendationDraft => {
  const hasRegulatedData = app?.dataSensitivities.includes('regulated') ?? false;
  const hasPersonalAccounts = app?.accountTypes.includes('personal') ?? false;
  const hasOauthGrants = (app?.oauthScopes.length ?? 0) > 0;
  const isUnsanctioned = app !== null && app.status !== 'approved';
  const reasoning = [
    isUnsanctioned ? `${app?.name} is not an approved AI tool (status: ${app?.status}).` : null,
    hasRegulatedData ? 'Regulated data was sent to it, which creates possible notification obligations.' : null,
    hasPersonalAccounts ? 'Personal accounts were used, so corporate controls and logs do not cover the activity.' : null,
    hasOauthGrants ? `It holds OAuth grants (${app?.oauthScopes.join(', ')}) that keep access open until revoked.` : null,
    app && app.risk.missingSignals.length
      ? `Telemetry is incomplete (${app.risk.missingSignals.join(', ')}), so the assessment is scored conservatively.`
      : null,
  ].filter((line): line is string => line !== null);
  const candidateActions: { kind: ActionKind; description: string }[] = [
    { kind: 'block-app', description: `Block ${app?.domain ?? 'the app'} at the gateway until the review is decided.` },
    { kind: 'revoke-oauth-grant', description: `Revoke the OAuth grants held by ${app?.name ?? 'the app'}.` },
    { kind: 'notify-user', description: 'Coach the affected users and point them to the approved alternative.' },
    { kind: 'add-dlp-rule', description: 'Add a DLP rule that blocks regulated uploads to uncategorized AI domains.' },
    { kind: 'open-ticket', description: 'Open a vendor risk assessment ticket for the governance board.' },
  ];
  const actions = candidateActions.filter(({ kind }) => {
    if (kind === 'add-dlp-rule') {
      return hasRegulatedData;
    }
    return isActionApplicable({ kind, app });
  });
  return {
    provider: 'rules-engine',
    model: 'cockpit-rules-v1',
    summary: `${incident.title}. Contain first, then coach users and complete the vendor review.`,
    reasoning: reasoning.length ? reasoning : ['No elevated risk factors found; notify and track.'],
    confidence: getConfidence(app),
    actions,
  };
};

const azureResponseSchema = z.object({
  summary: z.string().min(1).max(600),
  reasoning: z.array(z.string().min(1).max(400)).min(1).max(6),
  confidence: z.enum(['high', 'medium', 'low']),
  actions: z
    .array(z.object({ kind: z.string(), description: z.string().min(1).max(300) }))
    .max(6),
});

const systemPrompt = [
  'You are an assistant to a security operations analyst in a regulated enterprise.',
  'You recommend triage steps for incidents involving unauthorized AI applications.',
  'You never execute actions; every action you propose waits for human approval.',
  `Propose only actions whose kind is one of: ${allowedActionKinds.join(', ')}.`,
  'Base your reasoning only on the provided context. Say when telemetry is missing.',
  'Respond with JSON: {"summary": string, "reasoning": string[], "confidence": "high"|"medium"|"low", "actions": [{"kind": string, "description": string}]}.',
].join(' ');

type AzureRecommendationParams = RecommendationContext & {
  config: AzureOpenAiConfig;
  contextText: string;
  fetchImplementation?: typeof fetch;
};

export const generateAzureOpenAiRecommendation = async ({
  incident,
  app,
  config,
  contextText,
  fetchImplementation = fetch,
}: AzureRecommendationParams): Promise<RecommendationDraft> => {
  const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
  const response = await fetchImplementation(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': config.apiKey },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: contextText },
      ],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`Azure OpenAI returned HTTP ${response.status}`);
  }
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Azure OpenAI returned no content');
  }
  const parsed = azureResponseSchema.parse(JSON.parse(content));
  const actions = parsed.actions
    .filter((action): action is { kind: ActionKind; description: string } =>
      allowedActionKinds.includes(action.kind as ActionKind),
    )
    .filter(({ kind }) => isActionApplicable({ kind, app }));
  const fallbackActions = buildRuleBasedRecommendation({ incident, app }).actions;
  return {
    provider: 'azure-openai',
    model: config.deployment,
    summary: parsed.summary,
    reasoning: parsed.reasoning,
    confidence: parsed.confidence,
    actions: actions.length ? actions : fallbackActions,
  };
};
