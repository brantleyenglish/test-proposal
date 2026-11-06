import type { Overview, RiskTier } from '../../../shared/types';
import { ErrorCallout } from '../components/ErrorCallout';
import { SimulationPanel } from '../components/SimulationPanel';
import { StatusPill } from '../components/StatusPill';
import { useCockpit } from '../CockpitContext';
import { formatPercent, shortHash, sourceLabels } from '../format';
import { useResource } from '../useResource';

const tiers: RiskTier[] = ['Low', 'Moderate', 'High', 'Critical'];

export const OverviewView = () => {
  const { navigate } = useCockpit();
  const { data: overview, error } = useResource<Overview>('/overview');

  if (!overview) {
    return <ErrorCallout message={error} />;
  }

  const kpis = [
    { label: 'AI apps discovered', value: overview.appCount, note: `${overview.unsanctionedAppCount} not approved`, view: 'discovery' as const },
    { label: 'Reviews awaiting a decision', value: overview.pendingReviewCount, note: 'Routed by risk tier', view: 'approvals' as const },
    { label: 'Open AI incidents', value: overview.openIncidentCount, note: 'Need triage', view: 'incidents' as const },
    {
      label: 'Actions awaiting human approval',
      value: overview.actionsAwaitingApprovalCount,
      note: 'Nothing runs without approval',
      view: 'incidents' as const,
    },
  ];
  const totalApps = tiers.reduce((total, tier) => total + overview.tierCounts[tier], 0);
  const { auditVerification } = overview;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>AI security posture</h1>
          <p>Discover AI usage, evaluate risk, route approvals, and triage incidents with human approval.</p>
        </div>
        <StatusPill tone={auditVerification.isValid ? 'good' : 'critical'}>
          Audit chain {auditVerification.isValid ? 'verified' : `broken at #${auditVerification.brokenAtSequence}`} ·{' '}
          {auditVerification.entryCount} entries
        </StatusPill>
      </div>

      <section className="grid-kpi" aria-label="Key indicators">
        {kpis.map(({ label, value, note, view }) => (
          <button key={label} type="button" className="card list-button" onClick={() => navigate({ view })}>
            <span className="muted">{label}</span>
            <span className="kpi-value">{value}</span>
            <span className="secondary">{note}</span>
          </button>
        ))}
      </section>

      <div className="split">
        <div className="split-main">
          <SimulationPanel />
          <section className="card" aria-labelledby="demo-heading">
            <h2 id="demo-heading">Demo script</h2>
            <ol className="steps">
              <li>As Dana (SOC analyst), simulate the PDF summarizer detection above.</li>
              <li>Open the classification to show the risk factors, the missing telemetry, and the routing decision.</li>
              <li>Triage the incident: generate the AI recommendation and note what was redacted.</li>
              <li>Try to approve the block as Dana (refused), then switch to Sam (security lead) and approve it with a rationale.</li>
              <li>Show the incident audit history and verify the hash chain as Riley (GRC auditor).</li>
              <li>Bonus: simulate the email agent; the Critical review needs two approvers.</li>
            </ol>
          </section>
        </div>
        <div className="split-side">
          <section className="card" aria-labelledby="tiers-heading">
            <div className="card-header">
              <h2 id="tiers-heading">Apps by risk tier</h2>
              <span className="muted">{totalApps} apps</span>
            </div>
            <div className="tier-bar" role="img" aria-label={tiers.map((tier) => `${overview.tierCounts[tier]} ${tier}`).join(', ')}>
              {tiers.map((tier) =>
                overview.tierCounts[tier] ? (
                  <div key={tier} className={`tier-${tier}`} style={{ flex: overview.tierCounts[tier] }} title={`${tier}: ${overview.tierCounts[tier]}`} />
                ) : null,
              )}
            </div>
            <div className="legend">
              {tiers.map((tier) => (
                <span key={tier} className="tier">
                  <span aria-hidden="true" className={`tier-swatch tier-${tier}`} />
                  {tier} · {overview.tierCounts[tier]}
                </span>
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="coverage-heading">
            <div className="card-header">
              <h2 id="coverage-heading">Telemetry coverage</h2>
              <span className="muted">Complete = user, data class and account known</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Source</th>
                    <th scope="col" className="align-right">Events</th>
                    <th scope="col" className="align-right">Complete</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.telemetryCoverage.map(({ source, eventCount, completeEventCount }) => (
                    <tr key={source}>
                      <td>{sourceLabels[source]}</td>
                      <td className="mono align-right">{eventCount}</td>
                      <td className="mono align-right">
                        {eventCount ? formatPercent({ part: completeEventCount, whole: eventCount }) : 'no feed'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted">
              Gaps lower assessment confidence; low-confidence apps always route to a security lead.
            </p>
          </section>

          <section className="card">
            <h2>Audit head</h2>
            <span className="hash">{auditVerification.headHash ? shortHash(auditVerification.headHash) : 'empty'}</span>
          </section>
        </div>
      </div>
    </>
  );
};
