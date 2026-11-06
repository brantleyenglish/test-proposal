import type { AppDetail } from '../../../shared/types';
import { useCockpit } from '../CockpitContext';
import { appStatusLabels, appStatusTones, formatDateTime } from '../format';
import { useResource } from '../useResource';
import { AuditTimeline } from './AuditTimeline';
import { ErrorCallout } from './ErrorCallout';
import { StatusPill } from './StatusPill';
import { TierLabel } from './TierLabel';

type AppDetailPanelProps = { appId: string };

export const AppDetailPanel = ({ appId }: AppDetailPanelProps) => {
  const { navigate } = useCockpit();
  const { data: detail, error } = useResource<AppDetail>(`/apps/${appId}`);

  if (!detail) {
    return <ErrorCallout message={error} />;
  }

  const { app, review, auditHistory } = detail;

  const ReviewSummary = () => {
    if (!review) {
      return <p className="muted">No review on record.</p>;
    }
    if (review.status === 'pending') {
      return (
        <div className="stack">
          <p>
            Routed to a security <strong>{review.routedToRole}</strong>: {review.routingReason} Due{' '}
            {formatDateTime(review.slaDueAt)}. {review.decisions.length} of {review.requiredApprovals} approvals recorded.
          </p>
          <button type="button" className="button button-primary" onClick={() => navigate({ view: 'approvals' })}>
            Open in approvals
          </button>
        </div>
      );
    }
    return (
      <p>
        Decided <strong>{review.outcome}</strong> by {review.decisions.map(({ userName }) => userName).join(' and ')}.
      </p>
    );
  };

  return (
    <>
      <section className="card" aria-labelledby="app-detail-heading">
        <div className="stack">
          <span className="muted">Risk classification</span>
          <h2 id="app-detail-heading">{app.name}</h2>
          <span className="muted">
            {app.domain} · {app.category} · first seen {formatDateTime(app.firstSeenAt)}
          </span>
        </div>
        <div className="inline">
          <TierLabel {...app.risk} showConfidence />
          <StatusPill tone={appStatusTones[app.status]}>{appStatusLabels[app.status]}</StatusPill>
        </div>
        <div className="factor-list">
          {app.risk.factors.map((factor) => (
            <div key={factor.key} className="factor-row">
              <div className="factor-row-header">
                <span>
                  {factor.label}
                  {factor.isEstimated ? <span className="muted"> · estimated</span> : null}
                </span>
                <span className="mono secondary">
                  {factor.points} / {factor.maxPoints}
                </span>
              </div>
              <div className={factor.isEstimated ? 'meter meter-estimated' : 'meter'}>
                <div style={{ width: `${(factor.points / factor.maxPoints) * 100}%` }} />
              </div>
              <span className="muted">{factor.rationale}</span>
            </div>
          ))}
        </div>
        {app.risk.missingSignals.length ? (
          <p className="callout callout-info">
            Incomplete telemetry: {app.risk.missingSignals.join(', ')}. These factors are scored conservatively until a
            connector reports them.
          </p>
        ) : null}
      </section>
      <section className="card" aria-labelledby="app-review-heading">
        <h2 id="app-review-heading">Review routing</h2>
        <ReviewSummary />
      </section>
      <section className="card" aria-labelledby="app-audit-heading">
        <h2 id="app-audit-heading">Audit history</h2>
        <AuditTimeline entries={auditHistory} />
      </section>
    </>
  );
};
