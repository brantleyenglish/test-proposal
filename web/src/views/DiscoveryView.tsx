import { useState } from 'react';

import type { AiApp, AppStatus } from '../../../shared/types';
import { AppDetailPanel } from '../components/AppDetailPanel';
import { ErrorCallout } from '../components/ErrorCallout';
import { SimulationPanel } from '../components/SimulationPanel';
import { StatusPill } from '../components/StatusPill';
import { TierLabel } from '../components/TierLabel';
import { useCockpit } from '../CockpitContext';
import { appStatusLabels, appStatusTones, formatDateTime, sourceLabels } from '../format';
import { useResource } from '../useResource';

type StatusFilter = AppStatus | 'all';

const statusFilters: StatusFilter[] = ['all', 'in-review', 'blocked', 'restricted', 'approved'];

export const DiscoveryView = () => {
  const { selectedAppId, navigate } = useCockpit();
  const { data: apps, error } = useResource<AiApp[]>('/apps');

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const visibleApps = (apps ?? []).filter((app) => statusFilter === 'all' || app.status === statusFilter);
  const activeAppId = selectedAppId ?? apps?.[0]?.id ?? null;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>AI discovery</h1>
          <p>Every AI app seen across identity, network, DLP, browser, and employee reports, scored on six factors.</p>
        </div>
        <div className="segmented" role="group" aria-label="Filter by status">
          {statusFilters.map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={filter === statusFilter}
              onClick={() => setStatusFilter(filter)}
            >
              {filter === 'all' ? 'All' : appStatusLabels[filter]} (
              {(apps ?? []).filter((app) => filter === 'all' || app.status === filter).length})
            </button>
          ))}
        </div>
      </div>
      <ErrorCallout message={error} />
      <div className="split">
        <div className="split-main">
          <section className="card card-tight" aria-label="AI apps">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">App</th>
                    <th scope="col">Risk</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="align-right">Users</th>
                    <th scope="col">Sources</th>
                    <th scope="col">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleApps.map((app) => (
                    <tr key={app.id} className={app.id === activeAppId ? 'is-selected' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="button-link"
                          aria-pressed={app.id === activeAppId}
                          onClick={() => navigate({ view: 'discovery', appId: app.id })}
                        >
                          {app.name}
                        </button>
                        <div className="muted">
                          {app.domain} · {app.category}
                        </div>
                      </td>
                      <td>
                        <TierLabel {...app.risk} />
                        <div className="muted">{app.risk.confidence} confidence</div>
                      </td>
                      <td>
                        <StatusPill tone={appStatusTones[app.status]}>{appStatusLabels[app.status]}</StatusPill>
                      </td>
                      <td className="mono align-right">{app.pseudonymousUserIds.length}</td>
                      <td className="secondary">{app.sources.map((source) => sourceLabels[source]).join(', ')}</td>
                      <td className="muted">{formatDateTime(app.lastSeenAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleApps.length ? null : <p className="empty">No apps with this status.</p>}
          </section>
          <SimulationPanel />
        </div>
        <div className="split-side">
          {activeAppId ? <AppDetailPanel appId={activeAppId} /> : null}
        </div>
      </div>
    </>
  );
};
