import type { IncidentDetail, Recommendation } from '../../../shared/types';
import { useCockpit } from '../CockpitContext';
import { formatDateTime, incidentStatusLabels, severityTones } from '../format';
import { useMutation } from '../useMutation';
import { useResource } from '../useResource';
import { AuditTimeline } from './AuditTimeline';
import { ErrorCallout } from './ErrorCallout';
import { RecommendationPanel } from './RecommendationPanel';
import { StatusPill } from './StatusPill';
import { TierLabel } from './TierLabel';

type IncidentDetailPanelProps = { incidentId: string };

export const IncidentDetailPanel = ({ incidentId }: IncidentDetailPanelProps) => {
  const { navigate, config } = useCockpit();
  const { data: detail, error } = useResource<IncidentDetail>(`/incidents/${incidentId}`);
  const {
    mutate,
    isPending,
    error: recommendationError,
  } = useMutation<{ recommendation: Recommendation }>();

  if (!detail) {
    return <ErrorCallout message={error} />;
  }

  const { incident, app, auditHistory } = detail;
  const { recommendation } = incident;
  const hasDecidedActions = recommendation?.proposedActions.some(({ status }) => status !== 'awaiting-approval') ?? false;
  const providerName = config?.recommendationProvider === 'azure-openai' ? 'Azure OpenAI' : 'the rules engine';

  const generateRecommendation = () => mutate({ path: `/incidents/${incident.id}/recommendation` });

  return (
    <>
      <section className="card" aria-labelledby="incident-heading">
        <div className="stack">
          <span className="muted">
            {incident.id} · opened {formatDateTime(incident.createdAt)}
          </span>
          <h2 id="incident-heading">{incident.title}</h2>
        </div>
        <div className="inline">
          <StatusPill tone={severityTones[incident.severity]}>{incident.severity} severity</StatusPill>
          <StatusPill tone="info">{incidentStatusLabels[incident.status]}</StatusPill>
          {incident.ingestRedactionCount ? (
            <StatusPill tone="good">{incident.ingestRedactionCount} values redacted at ingest</StatusPill>
          ) : null}
        </div>
        <h3>Signals</h3>
        <ul className="signal-list">
          {incident.signals.map((signal) => (
            <li key={signal}>{signal}</li>
          ))}
        </ul>
        {app ? (
          <div className="inline">
            <span>AI app:</span>
            <button type="button" className="button-link" onClick={() => navigate({ view: 'discovery', appId: app.id })}>
              {app.name}
            </button>
            <TierLabel {...app.risk} showConfidence />
          </div>
        ) : null}
      </section>

      <section className="card" aria-labelledby="recommendation-heading">
        <div className="card-header">
          <h2 id="recommendation-heading">AI-assisted recommendation</h2>
          <button
            type="button"
            className="button button-ai"
            onClick={generateRecommendation}
            disabled={isPending || hasDecidedActions}
          >
            {isPending ? 'Analyzing…' : 'Generate recommendation'}
          </button>
        </div>
        <ErrorCallout message={recommendationError} />
        <RecommendationPanel incidentId={incident.id} recommendation={recommendation} providerName={providerName} />
      </section>

      <section className="card" aria-labelledby="incident-audit-heading">
        <div className="card-header">
          <h2 id="incident-audit-heading">Audit history</h2>
          <span className="muted">Hash-chained, append-only</span>
        </div>
        <AuditTimeline entries={auditHistory} />
      </section>
    </>
  );
};
