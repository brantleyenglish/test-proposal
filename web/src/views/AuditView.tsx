import { useState } from 'react';

import type { AuditEntry, AuditVerification } from '../../../shared/types';
import { ErrorCallout } from '../components/ErrorCallout';
import { StatusPill } from '../components/StatusPill';
import { formatAuditAction, formatDateTime, shortHash } from '../format';
import { useResource } from '../useResource';

export const AuditView = () => {
  const { data: entries, error } = useResource<AuditEntry[]>('/audit');
  const { data: verification } = useResource<AuditVerification>('/audit/verify');

  const [filterText, setFilterText] = useState('');

  const normalizedFilter = filterText.trim().toLowerCase();
  const visibleEntries = (entries ?? []).filter(
    (entry) =>
      !normalizedFilter ||
      [entry.action, entry.actorName, entry.entityId, ...entry.relatedIds, ...Object.values(entry.details).map(String)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedFilter),
  );

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Audit log</h1>
          <p>
            Every detection, classification, routing, AI recommendation, human decision, and executed action. Each entry
            hashes the one before it, so edits and deletions are detectable.
          </p>
        </div>
        {verification ? (
          <StatusPill tone={verification.isValid ? 'good' : 'critical'}>
            {verification.isValid
              ? `Chain verified · ${verification.entryCount} entries`
              : `Chain broken at #${verification.brokenAtSequence}`}
          </StatusPill>
        ) : null}
      </div>
      <ErrorCallout message={error} />
      <label className="field">
        Filter
        <input
          value={filterText}
          onChange={(event) => setFilterText(event.target.value)}
          placeholder="Search by action, actor, app, incident or detail, e.g. inc-0 or quicksummary"
        />
      </label>
      <section className="card card-tight" aria-label="Audit entries">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">When</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
                <th scope="col">Details</th>
                <th scope="col">Hash</th>
              </tr>
            </thead>
            <tbody>
              {visibleEntries.slice(0, 300).map((entry) => (
                <tr key={entry.sequence}>
                  <td className="mono">{entry.sequence}</td>
                  <td className="muted">{formatDateTime(entry.at)}</td>
                  <td>
                    <StatusPill tone={entry.actorType === 'ai' ? 'ai' : 'neutral'}>{entry.actorType}</StatusPill>
                    <div>{entry.actorName}</div>
                  </td>
                  <td>{formatAuditAction(entry.action)}</td>
                  <td className="mono">{entry.entityId}</td>
                  <td className="timeline-details">
                    {Object.entries(entry.details)
                      .filter(([, value]) => value !== null && value !== '')
                      .map(([key, value]) => `${key}: ${String(value)}`)
                      .join(' · ')}
                  </td>
                  <td className="hash">{shortHash(entry.hash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visibleEntries.length ? null : <p className="empty">No entries match.</p>}
      </section>
    </>
  );
};
