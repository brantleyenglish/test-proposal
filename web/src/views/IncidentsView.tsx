import type { Incident } from '../../../shared/types';
import { ErrorCallout } from '../components/ErrorCallout';
import { IncidentDetailPanel } from '../components/IncidentDetailPanel';
import { StatusPill } from '../components/StatusPill';
import { useCockpit } from '../CockpitContext';
import { formatDateTime, incidentStatusLabels, severityTones } from '../format';
import { useResource } from '../useResource';

export const IncidentsView = () => {
  const { selectedIncidentId, navigate } = useCockpit();
  const { data: incidents, error } = useResource<Incident[]>('/incidents');

  const activeIncidentId = selectedIncidentId ?? incidents?.[0]?.id ?? null;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Incident triage</h1>
          <p>AI proposes, people decide. Containment actions need a security lead; every step is audited.</p>
        </div>
      </div>
      <ErrorCallout message={error} />
      <div className="split">
        <div className="split-side">
          <section className="card" aria-labelledby="incident-list-heading">
            <h2 id="incident-list-heading">Incidents</h2>
            {(incidents ?? []).length ? null : <p className="muted">No incidents yet.</p>}
            {(incidents ?? []).map((incident) => (
              <button
                key={incident.id}
                type="button"
                className="list-button"
                aria-pressed={incident.id === activeIncidentId}
                onClick={() => navigate({ view: 'incidents', incidentId: incident.id })}
              >
                <strong>{incident.title}</strong>
                <span className="inline">
                  <StatusPill tone={severityTones[incident.severity]}>{incident.severity}</StatusPill>
                  <StatusPill tone="info">{incidentStatusLabels[incident.status]}</StatusPill>
                  <span className="muted">{formatDateTime(incident.createdAt)}</span>
                </span>
              </button>
            ))}
          </section>
        </div>
        <div className="split-main">
          {activeIncidentId ? <IncidentDetailPanel incidentId={activeIncidentId} /> : null}
        </div>
      </div>
    </>
  );
};
