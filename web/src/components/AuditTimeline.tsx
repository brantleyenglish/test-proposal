import type { AuditEntry } from '../../../shared/types';
import { formatAuditAction, formatDateTime, shortHash } from '../format';

type AuditTimelineProps = { entries: AuditEntry[] };

const formatDetails = (details: AuditEntry['details']) =>
  Object.entries(details)
    .filter(([, value]) => value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');

export const AuditTimeline = ({ entries }: AuditTimelineProps) => {
  if (!entries.length) {
    return <p className="muted">No audit entries yet.</p>;
  }
  return (
    <ol className="timeline" aria-label="Audit history">
      {entries.map((entry) => (
        <li key={entry.sequence}>
          <span aria-hidden="true" className={`timeline-dot timeline-dot-${entry.actorType}`} />
          <div className="timeline-body">
            <div className="inline">
              <strong>{formatAuditAction(entry.action)}</strong>
              <span className="muted">
                {formatDateTime(entry.at)} · {entry.actorName}
              </span>
            </div>
            <span className="timeline-details">{formatDetails(entry.details)}</span>
            <span className="hash">
              #{entry.sequence} · hash {shortHash(entry.hash)} · prev {shortHash(entry.previousHash)}
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
};
