import type {
  AccountType,
  AiApp,
  AssessmentConfidence,
  DataSensitivity,
  RiskAssessment,
  RiskFactor,
  RiskTier,
  Role,
} from '../shared/types';

export type RiskInputs = Pick<
  AiApp,
  | 'sources'
  | 'pseudonymousUserIds'
  | 'dataSensitivities'
  | 'accountTypes'
  | 'oauthScopes'
  | 'vendorTrainsOnCustomerData'
  | 'vendorHasSoc2'
  | 'vendorSupportsSso'
>;

const sensitivityRank: Record<DataSensitivity, number> = {
  none: 0,
  internal: 1,
  confidential: 2,
  regulated: 3,
};

const writeScopePattern = /(send|write|readwrite|manage|full_access|\.all$)/i;

const getHighestSensitivity = (sensitivities: DataSensitivity[]) =>
  sensitivities.reduce<DataSensitivity | null>((highest, sensitivity) => {
    if (highest === null || sensitivityRank[sensitivity] > sensitivityRank[highest]) {
      return sensitivity;
    }
    return highest;
  }, null);

const scoreDataSensitivity = (sensitivities: DataSensitivity[]): RiskFactor => {
  const highestSensitivity = getHighestSensitivity(sensitivities);
  const base = { key: 'data-sensitivity', label: 'Data sensitivity', maxPoints: 30 };
  if (highestSensitivity === null) {
    return {
      ...base,
      points: 20,
      rationale: 'No DLP classification observed; scored conservatively until Purview reports.',
      isEstimated: true,
    };
  }
  const pointsBySensitivity: Record<DataSensitivity, number> = {
    none: 3,
    internal: 12,
    confidential: 22,
    regulated: 30,
  };
  return {
    ...base,
    points: pointsBySensitivity[highestSensitivity],
    rationale: `Highest classification observed: ${highestSensitivity}.`,
    isEstimated: false,
  };
};

const scoreVendorDataHandling = (trainsOnCustomerData: boolean | null): RiskFactor => {
  const base = { key: 'vendor-data-handling', label: 'Vendor data handling', maxPoints: 20 };
  if (trainsOnCustomerData === null) {
    return {
      ...base,
      points: 14,
      rationale: 'Vendor training and retention terms unknown.',
      isEstimated: true,
    };
  }
  return trainsOnCustomerData
    ? { ...base, points: 20, rationale: 'Vendor may train on customer inputs.', isEstimated: false }
    : { ...base, points: 4, rationale: 'Contractual no-training terms.', isEstimated: false };
};

const scoreVendorAssurance = (hasSoc2: boolean | null): RiskFactor => {
  const base = { key: 'vendor-assurance', label: 'Vendor security assurance', maxPoints: 15 };
  if (hasSoc2 === null) {
    return {
      ...base,
      points: 10,
      rationale: 'No attestation on file yet.',
      isEstimated: true,
    };
  }
  return hasSoc2
    ? { ...base, points: 3, rationale: 'SOC 2 Type II report on file.', isEstimated: false }
    : { ...base, points: 15, rationale: 'Vendor has no security attestation.', isEstimated: false };
};

type AutonomyParams = { oauthScopes: string[]; hasIdentityTelemetry: boolean };

const scoreAutonomy = ({ oauthScopes, hasIdentityTelemetry }: AutonomyParams): RiskFactor => {
  const base = { key: 'autonomy', label: 'Autonomy and access', maxPoints: 15 };
  const writeScopes = oauthScopes.filter((scope) => writeScopePattern.test(scope));
  if (writeScopes.length) {
    return {
      ...base,
      points: 15,
      rationale: `Can act on the user's behalf: ${writeScopes.join(', ')}.`,
      isEstimated: false,
    };
  }
  if (oauthScopes.length) {
    return {
      ...base,
      points: 9,
      rationale: `Read access to corporate data: ${oauthScopes.join(', ')}.`,
      isEstimated: false,
    };
  }
  if (hasIdentityTelemetry) {
    return { ...base, points: 2, rationale: 'No OAuth grants found in Entra ID.', isEstimated: false };
  }
  return {
    ...base,
    points: 7,
    rationale: 'No identity telemetry, so OAuth grants are unknown.',
    isEstimated: true,
  };
};

const scoreAdoption = (userCount: number): RiskFactor => {
  const base = { key: 'adoption', label: 'Adoption footprint', maxPoints: 10 };
  const points = getAdoptionPoints(userCount);
  return {
    ...base,
    points,
    rationale: `${userCount} distinct ${userCount === 1 ? 'user' : 'users'} observed.`,
    isEstimated: false,
  };
};

const getAdoptionPoints = (userCount: number) => {
  if (userCount >= 100) {
    return 10;
  }
  if (userCount >= 25) {
    return 7;
  }
  if (userCount >= 5) {
    return 4;
  }
  return 2;
};

type IdentityControlParams = { accountTypes: AccountType[]; supportsSso: boolean | null };

const scoreIdentityControl = ({ accountTypes, supportsSso }: IdentityControlParams): RiskFactor => {
  const base = { key: 'identity-control', label: 'Identity control', maxPoints: 10 };
  if (accountTypes.includes('personal')) {
    return {
      ...base,
      points: 10,
      rationale: 'Personal accounts in use, outside corporate identity.',
      isEstimated: false,
    };
  }
  if (supportsSso === false) {
    return { ...base, points: 8, rationale: 'Vendor does not support SSO.', isEstimated: false };
  }
  if (accountTypes.includes('corporate') && supportsSso) {
    return { ...base, points: 1, rationale: 'Corporate accounts through SSO.', isEstimated: false };
  }
  return {
    ...base,
    points: 6,
    rationale: 'Account type and SSO support unknown.',
    isEstimated: true,
  };
};

export const getRiskTier = (score: number): RiskTier => {
  if (score >= 80) {
    return 'Critical';
  }
  if (score >= 60) {
    return 'High';
  }
  if (score >= 35) {
    return 'Moderate';
  }
  return 'Low';
};

const getConfidence = (estimatedFactorCount: number): AssessmentConfidence => {
  if (estimatedFactorCount <= 1) {
    return 'high';
  }
  if (estimatedFactorCount <= 3) {
    return 'medium';
  }
  return 'low';
};

export const assessRisk = (inputs: RiskInputs): RiskAssessment => {
  const factors = [
    scoreDataSensitivity(inputs.dataSensitivities),
    scoreVendorDataHandling(inputs.vendorTrainsOnCustomerData),
    scoreVendorAssurance(inputs.vendorHasSoc2),
    scoreAutonomy({
      oauthScopes: inputs.oauthScopes,
      hasIdentityTelemetry: inputs.sources.includes('entra-id'),
    }),
    scoreAdoption(inputs.pseudonymousUserIds.length),
    scoreIdentityControl({
      accountTypes: inputs.accountTypes,
      supportsSso: inputs.vendorSupportsSso,
    }),
  ];
  const score = factors.reduce((total, factor) => total + factor.points, 0);
  const missingSignals = factors
    .filter((factor) => factor.isEstimated)
    .map((factor) => factor.label);
  return {
    score,
    tier: getRiskTier(score),
    confidence: getConfidence(missingSignals.length),
    factors,
    missingSignals,
  };
};

export type ReviewRouting = {
  routedToRole: Role;
  requiredApprovals: number;
  slaDays: number;
  routingReason: string;
};

export const routeReview = (risk: RiskAssessment): ReviewRouting => {
  if (risk.tier === 'Critical') {
    return {
      routedToRole: 'lead',
      requiredApprovals: 2,
      slaDays: 1,
      routingReason: 'Critical tier: two distinct approvers, including a security lead.',
    };
  }
  if (risk.confidence === 'low') {
    return {
      routedToRole: 'lead',
      requiredApprovals: 1,
      slaDays: 3,
      routingReason: 'Low-confidence assessment from incomplete telemetry: security lead decides.',
    };
  }
  if (risk.tier === 'High') {
    return {
      routedToRole: 'lead',
      requiredApprovals: 1,
      slaDays: 3,
      routingReason: 'High tier: security lead decides.',
    };
  }
  if (risk.tier === 'Moderate') {
    return {
      routedToRole: 'lead',
      requiredApprovals: 1,
      slaDays: 5,
      routingReason: 'Moderate tier: security lead decides.',
    };
  }
  return {
    routedToRole: 'analyst',
    requiredApprovals: 1,
    slaDays: 5,
    routingReason: 'Low tier: any security analyst may decide.',
  };
};
