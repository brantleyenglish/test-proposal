import type { DemoUser, Review } from '../../shared/types';
import { canDecideAction, canDecideReview, hasPermission } from '../authorization';

const analyst: DemoUser = { id: 'user-dana', name: 'Dana', title: 'SOC analyst', role: 'analyst' };
const secondAnalyst: DemoUser = { id: 'user-jordan', name: 'Jordan', title: 'SOC analyst', role: 'analyst' };
const lead: DemoUser = { id: 'user-sam', name: 'Sam', title: 'Lead', role: 'lead' };
const auditor: DemoUser = { id: 'user-riley', name: 'Riley', title: 'Auditor', role: 'auditor' };
const employee: DemoUser = { id: 'user-alex', name: 'Alex', title: 'Claims', role: 'employee' };

const buildReview = (overrides: Partial<Review> = {}): Review => ({
  id: 'rev-1',
  appId: 'app-1',
  createdAt: '2026-10-29T00:00:00.000Z',
  slaDueAt: '2026-10-30T00:00:00.000Z',
  routedToRole: 'lead',
  routingReason: 'test',
  requiredApprovals: 1,
  status: 'pending',
  decisions: [],
  outcome: null,
  ...overrides,
});

describe('hasPermission', () => {
  it('keeps auditors read-only and employees to reporting', () => {
    expect(hasPermission({ user: auditor, permission: 'view-audit' })).toBe(true);
    expect(hasPermission({ user: auditor, permission: 'decide-action' })).toBe(false);
    expect(hasPermission({ user: employee, permission: 'report-app' })).toBe(true);
    expect(hasPermission({ user: employee, permission: 'view-security-data' })).toBe(false);
  });
});

describe('canDecideReview', () => {
  it('blocks an analyst from a lead-routed single-approval review', () => {
    expect(canDecideReview({ user: analyst, review: buildReview() })).toMatchObject({ isAllowed: false });
    expect(canDecideReview({ user: lead, review: buildReview() })).toEqual({ isAllowed: true });
  });

  it('enforces two distinct approvers with at least one lead for Critical reviews', () => {
    const review = buildReview({ requiredApprovals: 2 });
    expect(canDecideReview({ user: analyst, review })).toEqual({ isAllowed: true });
    const afterAnalyst = buildReview({
      requiredApprovals: 2,
      decisions: [
        { userId: analyst.id, userName: analyst.name, userRole: 'analyst', decision: 'block', rationale: 'x', decidedAt: '' },
      ],
    });
    expect(canDecideReview({ user: analyst, review: afterAnalyst })).toMatchObject({ isAllowed: false });
    expect(canDecideReview({ user: secondAnalyst, review: afterAnalyst })).toMatchObject({ isAllowed: false });
    expect(canDecideReview({ user: lead, review: afterAnalyst })).toEqual({ isAllowed: true });
  });

  it('rejects decisions on closed reviews', () => {
    expect(canDecideReview({ user: lead, review: buildReview({ status: 'decided' }) })).toMatchObject({
      isAllowed: false,
    });
  });
});

describe('canDecideAction', () => {
  it('requires a lead for containment and allows analysts for operational actions', () => {
    expect(canDecideAction({ user: analyst, requiredRole: 'lead' })).toMatchObject({ isAllowed: false });
    expect(canDecideAction({ user: lead, requiredRole: 'lead' })).toEqual({ isAllowed: true });
    expect(canDecideAction({ user: analyst, requiredRole: 'analyst' })).toEqual({ isAllowed: true });
    expect(canDecideAction({ user: auditor, requiredRole: 'analyst' })).toMatchObject({ isAllowed: false });
  });
});
