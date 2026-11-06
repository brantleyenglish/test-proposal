import { useState } from 'react';

import type { AiApp, Incident, Review, SimulationScenario, TelemetryEvent } from '../../../shared/types';
import { useCockpit } from '../CockpitContext';
import { useMutation } from '../useMutation';
import { useResource } from '../useResource';
import { ErrorCallout } from './ErrorCallout';
import { TierLabel } from './TierLabel';

type ScenarioOption = { scenario: SimulationScenario; label: string };

type DetectionResult = { event: TelemetryEvent; app: AiApp; review: Review | null; incident: Incident | null };

export const SimulationPanel = () => {
  const { navigate } = useCockpit();
  const { data: scenarios } = useResource<ScenarioOption[]>('/telemetry/scenarios');
  const { mutate, isPending, error } = useMutation<DetectionResult>();

  const [selectedScenario, setSelectedScenario] = useState<SimulationScenario>('unsanctioned-pdf-tool');
  const [detection, setDetection] = useState<DetectionResult | null>(null);

  const simulateDetection = async () => {
    const result = await mutate({ path: '/telemetry/simulate', body: { scenario: selectedScenario } });
    setDetection(result);
  };

  const DetectionSummary = () =>
    detection ? (
      <div className="callout callout-info stack" role="status">
        <strong>
          Detected {detection.app.name} ({detection.app.domain}) from {detection.event.source}
        </strong>
        <span>
          Classified <TierLabel {...detection.app.risk} showConfidence />.{' '}
          {detection.review
            ? `Routed to a security ${detection.review.routedToRole}, ${detection.review.requiredApprovals} approval(s) required.`
            : 'No review needed.'}{' '}
          {detection.incident ? `Incident ${detection.incident.id} opened.` : 'No incident opened.'} No action was
          taken automatically.
        </span>
        <div className="button-row">
          <button
            type="button"
            className="button"
            onClick={() => navigate({ view: 'discovery', appId: detection.app.id })}
          >
            View classification
          </button>
          <button type="button" className="button" onClick={() => navigate({ view: 'approvals' })}>
            Go to approvals
          </button>
          {detection.incident ? (
            <button
              type="button"
              className="button button-primary"
              onClick={() => navigate({ view: 'incidents', incidentId: detection.incident?.id })}
            >
              Triage incident
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

  return (
    <section className="card" aria-labelledby="simulate-heading">
      <div className="card-header">
        <h2 id="simulate-heading">Simulate a detection</h2>
        <span className="muted">Injects a telemetry event through the real discovery pipeline</span>
      </div>
      <div className="inline">
        <label className="field">
          Scenario
          <select
            value={selectedScenario}
            onChange={(event) => setSelectedScenario(event.target.value as SimulationScenario)}
          >
            {(scenarios ?? []).map(({ scenario, label }) => (
              <option key={scenario} value={scenario}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="button button-primary align-end"
          onClick={simulateDetection}
          disabled={isPending}
        >
          {isPending ? 'Detecting…' : 'Simulate detection'}
        </button>
      </div>
      <ErrorCallout message={error} />
      <DetectionSummary />
    </section>
  );
};
