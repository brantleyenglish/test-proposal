import type { ActionImpact, ActionKind, AiApp, Role } from '../shared/types';

type ActionPolicy = { impact: ActionImpact; requiredRole: Role; connector: string };

export const actionPolicies: Record<ActionKind, ActionPolicy> = {
  'block-app': { impact: 'containment', requiredRole: 'lead', connector: 'Defender for Cloud Apps' },
  'revoke-oauth-grant': { impact: 'containment', requiredRole: 'lead', connector: 'Microsoft Entra ID' },
  'notify-user': { impact: 'operational', requiredRole: 'analyst', connector: 'Microsoft Teams' },
  'add-dlp-rule': { impact: 'operational', requiredRole: 'analyst', connector: 'Microsoft Purview DLP' },
  'open-ticket': { impact: 'operational', requiredRole: 'analyst', connector: 'ITSM' },
};

export const allowedActionKinds = Object.keys(actionPolicies) as ActionKind[];

export const isActionApplicable = ({ kind, app }: { kind: ActionKind; app: AiApp | null }) => {
  if (kind === 'block-app') {
    return app !== null && app.status !== 'blocked' && app.status !== 'approved';
  }
  if (kind === 'revoke-oauth-grant') {
    return app !== null && app.oauthScopes.length > 0;
  }
  return true;
};

type ExecuteActionParams = { kind: ActionKind; app: AiApp | null; ticketNumber: number };

export const executeSimulatedAction = ({ kind, app, ticketNumber }: ExecuteActionParams) => {
  const appLabel = app ? `${app.name} (${app.domain})` : 'the affected AI app';
  const userCount = app?.pseudonymousUserIds.length ?? 0;
  const resultByKind: Record<ActionKind, string> = {
    'block-app': `${appLabel} tagged Unsanctioned; the secure web gateway now blocks it for all users.`,
    'revoke-oauth-grant': `OAuth consent for ${appLabel} revoked (${app?.oauthScopes.join(', ') ?? 'no scopes'}); refresh tokens invalidated.`,
    'notify-user': `Coaching message sent to ${userCount} affected ${userCount === 1 ? 'user' : 'users'} with the approved alternative and the AI use policy.`,
    'add-dlp-rule': 'DLP rule added: block regulated and confidential uploads to uncategorized generative AI domains.',
    'open-ticket': `Ticket SEC-${ticketNumber} opened for a vendor risk assessment of ${appLabel}.`,
  };
  return `[Simulated ${actionPolicies[kind].connector}] ${resultByKind[kind]}`;
};
