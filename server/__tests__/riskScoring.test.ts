import { assessRisk, getRiskTier, routeReview, type RiskInputs } from '../riskScoring';

const baseInputs: RiskInputs = {
  sources: ['entra-id'],
  pseudonymousUserIds: ['u1'],
  dataSensitivities: ['internal'],
  accountTypes: ['corporate'],
  oauthScopes: [],
  vendorTrainsOnCustomerData: false,
  vendorHasSoc2: true,
  vendorSupportsSso: true,
};

describe('assessRisk', () => {
  it('scores a well-governed enterprise tool as Low with high confidence', () => {
    const risk = assessRisk(baseInputs);
    expect(risk.score).toBe(12 + 4 + 3 + 2 + 2 + 1);
    expect(risk.tier).toBe('Low');
    expect(risk.confidence).toBe('high');
    expect(risk.missingSignals).toEqual([]);
  });

  it('scores regulated data, training vendors, write scopes and personal accounts as Critical', () => {
    const risk = assessRisk({
      ...baseInputs,
      dataSensitivities: ['internal', 'regulated'],
      accountTypes: ['personal'],
      oauthScopes: ['Mail.Send'],
      vendorTrainsOnCustomerData: true,
      vendorHasSoc2: false,
    });
    expect(risk.score).toBe(30 + 20 + 15 + 15 + 2 + 10);
    expect(risk.tier).toBe('Critical');
  });

  it('scores missing telemetry conservatively and lowers confidence', () => {
    const risk = assessRisk({
      sources: ['secure-web-gateway'],
      pseudonymousUserIds: [],
      dataSensitivities: [],
      accountTypes: [],
      oauthScopes: [],
      vendorTrainsOnCustomerData: null,
      vendorHasSoc2: null,
      vendorSupportsSso: null,
    });
    expect(risk.confidence).toBe('low');
    expect(risk.missingSignals).toHaveLength(5);
    expect(risk.factors.filter((factor) => factor.isEstimated)).toHaveLength(5);
    expect(risk.score).toBe(20 + 14 + 10 + 7 + 2 + 6);
  });
});

describe('getRiskTier', () => {
  it.each([
    [0, 'Low'],
    [34, 'Low'],
    [35, 'Moderate'],
    [59, 'Moderate'],
    [60, 'High'],
    [79, 'High'],
    [80, 'Critical'],
  ])('maps %i to %s', (score, tier) => {
    expect(getRiskTier(score)).toBe(tier);
  });
});

describe('routeReview', () => {
  it('requires two approvers for Critical apps', () => {
    const routing = routeReview({ ...assessRisk(baseInputs), tier: 'Critical' });
    expect(routing).toMatchObject({ routedToRole: 'lead', requiredApprovals: 2, slaDays: 1 });
  });

  it('sends low-confidence assessments to a lead even when the tier is Low', () => {
    const routing = routeReview({ ...assessRisk(baseInputs), tier: 'Low', confidence: 'low' });
    expect(routing.routedToRole).toBe('lead');
  });

  it('lets an analyst decide Low tier apps with good telemetry', () => {
    expect(routeReview(assessRisk(baseInputs)).routedToRole).toBe('analyst');
  });
});
