import type { AppDecision, AppStatus, ReviewWithApp } from '../../../shared/types';
import { ErrorCallout } from '../components/ErrorCallout';
import { ReviewCard } from '../components/ReviewCard';
import { StatusPill } from '../components/StatusPill';
import { appStatusLabels, appStatusTones, formatDateTime } from '../format';
import { useResource } from '../useResource';

const statusByOutcome: Record<AppDecision, AppStatus> = {
  approve: 'approved',
  restrict: 'restricted',
  block: 'blocked',
};

export const ApprovalsView = () => {
  const { data: reviews, error } = useResource<ReviewWithApp[]>('/reviews');

  const pendingReviews = (reviews ?? []).filter(({ status }) => status === 'pending');
  const decidedReviews = (reviews ?? []).filter(({ status }) => status === 'decided');

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Approvals</h1>
          <p>
            Reviews are routed by risk tier and telemetry confidence. Critical apps need two distinct approvers, one a
            security lead. Nothing is enforced until a human decides.
          </p>
        </div>
      </div>
      <ErrorCallout message={error} />
      <div className="split">
        <div className="split-main">
          {pendingReviews.length ? (
            pendingReviews.map((review) => <ReviewCard key={review.id} review={review} />)
          ) : (
            <p className="card empty">No reviews are waiting. Simulate a detection from the overview.</p>
          )}
        </div>
        <div className="split-side">
          <section className="card card-tight" aria-labelledby="decided-heading">
            <div className="card-header card-header-padded">
              <h2 id="decided-heading">Decided</h2>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">App</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Approvers</th>
                  </tr>
                </thead>
                <tbody>
                  {decidedReviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        {review.app.name}
                        <div className="muted">{formatDateTime(review.decisions.at(-1)?.decidedAt ?? review.createdAt)}</div>
                      </td>
                      <td>
                        {review.outcome ? (
                          <StatusPill tone={appStatusTones[statusByOutcome[review.outcome]]}>
                            {appStatusLabels[statusByOutcome[review.outcome]]}
                          </StatusPill>
                        ) : null}
                      </td>
                      <td className="secondary">{review.decisions.map(({ userName }) => userName).join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
};
