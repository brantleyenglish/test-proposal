import { useState } from 'react';

import type { ActionKind, ProposedAction } from '../../../shared/types';
import { formatDateTime } from '../format';
import { useMutation } from '../useMutation';
import { ErrorCallout } from './ErrorCallout';
import { StatusPill } from './StatusPill';

const actionTitles: Record<ActionKind, string> = {
  'block-app': 'Block the app',
  'revoke-oauth-grant': 'Revoke OAuth grants',
  'notify-user': 'Coach affected users',
  'add-dlp-rule': 'Add a DLP rule',
  'open-ticket': 'Open a vendor review ticket',
};

type ActionCardProps = { incidentId: string; action: ProposedAction };

export const ActionCard = ({ incidentId, action }: ActionCardProps) => {
  const { mutate, isPending, error } = useMutation();

  const [rationale, setRationale] = useState('');

  const isRationaleLongEnough = rationale.trim().length >= 15;
  const isAwaitingApproval = action.status === 'awaiting-approval';

  const decide = (verdict: 'approve' | 'reject') =>
    mutate({
      path: `/incidents/${incidentId}/actions/${action.id}/decision`,
      body: { verdict, rationale },
    });

  const Outcome = () => {
    if (!action.approval) {
      return null;
    }
    return (
      <div className={action.status === 'executed' ? 'callout callout-success stack' : 'callout callout-info stack'}>
        <span>
          {action.approval.verdict === 'approve' ? 'Approved' : 'Rejected'} by {action.approval.userName} at{' '}
          {formatDateTime(action.approval.decidedAt)}: “{action.approval.rationale}”
        </span>
        {action.executionResult ? <span>{action.executionResult}</span> : null}
      </div>
    );
  };

  return (
    <article className="action-card" aria-label={actionTitles[action.kind]}>
      <div className="card-header">
        <h3>{actionTitles[action.kind]}</h3>
        <div className="inline">
          <StatusPill tone={action.impact === 'containment' ? 'warning' : 'neutral'}>{action.impact}</StatusPill>
          <StatusPill tone="info">needs {action.requiredRole}</StatusPill>
        </div>
      </div>
      <p className="secondary">{action.description}</p>
      <Outcome />
      {isAwaitingApproval ? (
        <>
          <label className="field">
            Approval rationale
            <textarea
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              placeholder="Why is this action justified?"
            />
            <span className="field-hint">Required, at least 15 characters. Nothing runs until a person approves.</span>
          </label>
          <ErrorCallout message={error} />
          <div className="button-row">
            <button
              type="button"
              className="button button-primary"
              disabled={!isRationaleLongEnough || isPending}
              onClick={() => decide('approve')}
            >
              Approve and run
            </button>
            <button
              type="button"
              className="button button-danger"
              disabled={!isRationaleLongEnough || isPending}
              onClick={() => decide('reject')}
            >
              Reject
            </button>
          </div>
        </>
      ) : null}
    </article>
  );
};
