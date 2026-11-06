import type { DemoUser, Review, Role } from '../shared/types';

export type Permission =
  | 'report-app'
  | 'ingest-telemetry'
  | 'view-security-data'
  | 'decide-review'
  | 'generate-recommendation'
  | 'decide-action'
  | 'view-audit'
  | 'reset-demo';

const permissionsByRole: Record<Role, Permission[]> = {
  employee: ['report-app'],
  analyst: [
    'report-app',
    'ingest-telemetry',
    'view-security-data',
    'decide-review',
    'generate-recommendation',
    'decide-action',
    'view-audit',
  ],
  lead: [
    'report-app',
    'ingest-telemetry',
    'view-security-data',
    'decide-review',
    'generate-recommendation',
    'decide-action',
    'view-audit',
    'reset-demo',
  ],
  auditor: ['view-security-data', 'view-audit'],
};

export const hasPermission = ({ user, permission }: { user: DemoUser; permission: Permission }) =>
  permissionsByRole[user.role].includes(permission);

export const roleSatisfies = ({ userRole, requiredRole }: { userRole: Role; requiredRole: Role }) => {
  if (userRole === requiredRole) {
    return true;
  }
  return userRole === 'lead' && requiredRole === 'analyst';
};

export type AuthorizationResult = { isAllowed: true } | { isAllowed: false; reason: string };

type CanDecideReviewParams = { user: DemoUser; review: Review };

export const canDecideReview = ({ user, review }: CanDecideReviewParams): AuthorizationResult => {
  if (review.status !== 'pending') {
    return { isAllowed: false, reason: 'This review is already decided.' };
  }
  if (!hasPermission({ user, permission: 'decide-review' })) {
    return { isAllowed: false, reason: `The ${user.role} role cannot decide AI app reviews.` };
  }
  if (review.decisions.some((decision) => decision.userId === user.id)) {
    return {
      isAllowed: false,
      reason: 'You already recorded a decision. A second, different approver is required.',
    };
  }
  const satisfiesRoutedRole = roleSatisfies({
    userRole: user.role,
    requiredRole: review.routedToRole,
  });
  const isFinalApproval = review.decisions.length + 1 >= review.requiredApprovals;
  const hasRoutedRoleDecision = review.decisions.some((decision) =>
    roleSatisfies({ userRole: decision.userRole, requiredRole: review.routedToRole }),
  );
  if (isFinalApproval && !satisfiesRoutedRole && !hasRoutedRoleDecision) {
    return {
      isAllowed: false,
      reason: `This review is routed to a security ${review.routedToRole}, who must be one of the approvers.`,
    };
  }
  return { isAllowed: true };
};

type CanDecideActionParams = { user: DemoUser; requiredRole: Role };

export const canDecideAction = ({ user, requiredRole }: CanDecideActionParams): AuthorizationResult => {
  if (!hasPermission({ user, permission: 'decide-action' })) {
    return { isAllowed: false, reason: `The ${user.role} role cannot approve security actions.` };
  }
  if (!roleSatisfies({ userRole: user.role, requiredRole })) {
    return {
      isAllowed: false,
      reason: `Containment actions need a security ${requiredRole}. Switch to a lead to approve.`,
    };
  }
  return { isAllowed: true };
};
