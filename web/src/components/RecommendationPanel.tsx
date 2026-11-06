import type { Recommendation } from '../../../shared/types';
import { formatDateTime } from '../format';
import { ActionCard } from './ActionCard';
import { StatusPill } from './StatusPill';

type RecommendationPanelProps = {
  incidentId: string;
  recommendation: Recommendation | null;
  providerName: string;
};

export const RecommendationPanel = ({ incidentId, recommendation, providerName }: RecommendationPanelProps) => {
  if (!recommendation) {
    return (
      <p className="muted">
        No recommendation yet. The incident context is redacted before it is sent to {providerName}.
      </p>
    );
  }
  return (
    <div className="stack">
      <div className="inline">
        <StatusPill tone="ai">
          {recommendation.provider === 'azure-openai' ? 'Azure OpenAI' : 'Rules engine'} · {recommendation.model}
        </StatusPill>
        <StatusPill tone="neutral">{recommendation.confidence} confidence</StatusPill>
        <StatusPill tone="neutral">{recommendation.redactionCount} redactions before model</StatusPill>
        <span className="muted">{formatDateTime(recommendation.generatedAt)}</span>
      </div>
      {recommendation.fallbackReason ? <p className="callout callout-info">{recommendation.fallbackReason}</p> : null}
      <div className="callout callout-ai stack">
        <strong>{recommendation.summary}</strong>
        <ul className="signal-list">
          {recommendation.reasoning.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <h3>Proposed actions</h3>
      <p className="muted">
        The AI can only propose actions from an allowlist. Each action's required role is set by policy, not by the
        model.
      </p>
      {recommendation.proposedActions.map((action) => (
        <ActionCard key={action.id} incidentId={incidentId} action={action} />
      ))}
    </div>
  );
};
