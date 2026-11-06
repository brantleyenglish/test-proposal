import { useState } from 'react';

import type { AppDecision, ReviewWithApp } from '../../../shared/types';
import { useCockpit } from '../CockpitContext';
import { formatDateTime, sourceLabels } from '../format';
import { useMutation } from '../useMutation';
import { ErrorCallout } from './ErrorCallout';
import { StatusPill } from './StatusPill';
import { TierLabel } from './TierLabel';

const decisionLabels: Record<AppDecision, string> = {
  approve: 'Approve',
  restrict: 'Approve with restrictions',
  block: 'Block',
};

const decisions: AppDecision[] = ['approve', 'restrict', 'block'];

type ReviewCardProps = { review: ReviewWithApp };

export const ReviewCard = ({ review }: ReviewCardProps) => {
  const { navigate } = useCockpit();
  const { mutate, isPending, error } = useMutation();

  const [form, setForm] = useState<{ decision: AppDecision; rationale: string }>({
    decision: review.app.risk.tier === 'Critical' ? 'block' : 'restrict',
    rationale: '',
  });

  const { app } = review;
  const isRationaleLongEnough = form.rationale.trim().length >= 15;

  const submitDecision = async () => {
    const result = await mutate({
      path: `/reviews/${review.id}/decisions`,
      body: { decision: form.decision, rationale: form.rationale },
    });
    if (result) {
      setForm((current) => ({ ...current, rationale: '' }));
    }
  };

  return (
    <article className="card" aria-labelledby={`review-${review.id}`}>
      <div className="card-header">
        <div className="stack">
          <h2 id={`review-${review.id}`}>{app.name}</h2>
          <span className="muted">
            {app.domain} · {app.category} · {app.pseudonymousUserIds.length} users ·{' '}
            {app.sources.map((source) => sourceLabels[source]).join(', ')}
          </span>
        </div>
        <TierLabel {...app.risk} showConfidence />
      </div>
      <div className="inline">
        <StatusPill tone="info">Routed to security {review.routedToRole}</StatusPill>
        <StatusPill tone={review.requiredApprovals > 1 ? 'warning' : 'neutral'}>
          {review.decisions.length} of {review.requiredApprovals} approvals
        </StatusPill>
        <StatusPill tone="neutral">Due {formatDateTime(review.slaDueAt)}</StatusPill>
      </div>
      <p className="secondary">{review.routingReason}</p>
      {review.decisions.length ? (
        <ul className="signal-list">
          {review.decisions.map((decision) => (
            <li key={decision.userId}>
              {decision.userName} ({decision.userRole}) chose <strong>{decision.decision}</strong>: “{decision.rationale}”
            </li>
          ))}
        </ul>
      ) : null}
      <div className="segmented" role="group" aria-label="Decision">
        {decisions.map((decision) => (
          <button
            key={decision}
            type="button"
            aria-pressed={form.decision === decision}
            onClick={() => setForm((current) => ({ ...current, decision }))}
          >
            {decisionLabels[decision]}
          </button>
        ))}
      </div>
      <label className="field">
        Rationale
        <textarea
          value={form.rationale}
          onChange={(event) => setForm((current) => ({ ...current, rationale: event.target.value }))}
          placeholder="What did you verify? This is recorded in the audit log."
        />
        <span className="field-hint">At least 15 characters. Your name, role and rationale are hash-chained into the audit log.</span>
      </label>
      <ErrorCallout message={error} />
      <div className="button-row">
        <button
          type="button"
          className="button button-primary"
          disabled={!isRationaleLongEnough || isPending}
          onClick={submitDecision}
        >
          Record decision
        </button>
        <button type="button" className="button" onClick={() => navigate({ view: 'discovery', appId: app.id })}>
          View risk factors
        </button>
      </div>
    </article>
  );
};
