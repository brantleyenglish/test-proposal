import type { DemoUser, Overview } from '../../../shared/types';
import { useCockpit, type CockpitView } from '../CockpitContext';
import { useMutation } from '../useMutation';

type NavItem = { view: CockpitView; label: string; count: number };

type AppHeaderProps = {
  users: DemoUser[];
  onSelectUser: (userId: string) => void;
  activeView: CockpitView;
  overview: Overview | null;
};

const roleLabels: Record<DemoUser['role'], string> = {
  employee: 'Employee',
  analyst: 'SOC analyst',
  lead: 'Security lead',
  auditor: 'GRC auditor',
};

export const AppHeader = ({ users, onSelectUser, activeView, overview }: AppHeaderProps) => {
  const { user, config, navigate } = useCockpit();
  const { mutate, isPending } = useMutation<{ status: string }>();

  const isEmployee = user.role === 'employee';
  const providerLabel = config?.recommendationProvider === 'azure-openai' ? `Azure OpenAI · ${config.model}` : 'Rules engine (offline)';
  const navItems: NavItem[] = isEmployee
    ? [{ view: 'report', label: 'Report an AI tool', count: 0 }]
    : [
        { view: 'overview', label: 'Overview', count: 0 },
        { view: 'discovery', label: 'AI discovery', count: overview?.unsanctionedAppCount ?? 0 },
        { view: 'approvals', label: 'Approvals', count: overview?.pendingReviewCount ?? 0 },
        { view: 'incidents', label: 'Incident triage', count: overview?.actionsAwaitingApprovalCount ?? 0 },
        { view: 'audit', label: 'Audit log', count: 0 },
        { view: 'report', label: 'Report an AI tool', count: 0 },
      ];

  const resetDemo = async () => {
    await mutate({ path: '/demo/reset' });
    navigate({ view: 'overview' });
  };

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <span className="brand-eyebrow">AI Security Operations</span>
            <span className="brand-title">AI SecOps Cockpit</span>
          </div>
          <div className="header-controls">
            <span className="pill pill-header" title="Recommendation provider">
              AI: {providerLabel}
            </span>
            <span className="pill pill-header">Connectors simulated</span>
            <label>
              Signed in as
              <select
                value={user.id}
                onChange={(event) => onSelectUser(event.target.value)}
                aria-label="Demo user"
              >
                {users.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} · {roleLabels[candidate.role]}
                  </option>
                ))}
              </select>
            </label>
            {user.role === 'lead' ? (
              <button type="button" className="button" onClick={resetDemo} disabled={isPending}>
                Reset demo
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <nav className="nav" aria-label="Cockpit sections">
        <div className="nav-inner">
          {navItems.map(({ view, label, count }) => (
            <button
              key={view}
              type="button"
              className="nav-button"
              aria-current={view === activeView ? 'page' : undefined}
              onClick={() => navigate({ view })}
            >
              {label}
              {count ? <span className="nav-count">{count}</span> : null}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
};
