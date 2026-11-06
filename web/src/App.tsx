import { useEffect, useState } from 'react';

import type { CockpitConfig, DemoUser, Overview } from '../../shared/types';
import { apiRequest, getErrorMessage } from './api';
import { CockpitProvider, type CockpitView, type NavigationTarget } from './CockpitContext';
import { AppHeader } from './components/AppHeader';
import { ApprovalsView } from './views/ApprovalsView';
import { AuditView } from './views/AuditView';
import { DiscoveryView } from './views/DiscoveryView';
import { IncidentsView } from './views/IncidentsView';
import { OverviewView } from './views/OverviewView';
import { ReportAppView } from './views/ReportAppView';

const storedUserKey = 'cockpit-demo-user';

const readStoredUserId = () => {
  try {
    return window.localStorage.getItem(storedUserKey);
  } catch {
    return null;
  }
};

const storeUserId = (userId: string) => {
  try {
    window.localStorage.setItem(storedUserKey, userId);
    return true;
  } catch {
    return false;
  }
};

type NavigationState = { view: CockpitView; selectedAppId: string | null; selectedIncidentId: string | null };

const viewComponents: Record<CockpitView, () => JSX.Element> = {
  overview: OverviewView,
  discovery: DiscoveryView,
  approvals: ApprovalsView,
  incidents: IncidentsView,
  audit: AuditView,
  report: ReportAppView,
};

type ActiveViewProps = { view: CockpitView };

const ActiveView = ({ view }: ActiveViewProps) => {
  const ViewComponent = viewComponents[view];
  return <ViewComponent />;
};

export const App = () => {
  const [session, setSession] = useState<{ users: DemoUser[]; userId: string | null; loadError: string | null }>({
    users: [],
    userId: readStoredUserId(),
    loadError: null,
  });
  const [config, setConfig] = useState<CockpitConfig | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [navigation, setNavigation] = useState<NavigationState>({
    view: 'overview',
    selectedAppId: null,
    selectedIncidentId: null,
  });

  const user = session.users.find((candidate) => candidate.id === session.userId) ?? session.users[1] ?? null;
  const isEmployee = user?.role === 'employee';
  const activeView = isEmployee ? 'report' : navigation.view;

  const selectUser = (userId: string) => {
    storeUserId(userId);
    setSession((current) => ({ ...current, userId }));
  };

  const navigate = ({ view, appId, incidentId }: NavigationTarget) =>
    setNavigation((current) => ({
      view,
      selectedAppId: appId ?? current.selectedAppId,
      selectedIncidentId: incidentId ?? current.selectedIncidentId,
    }));

  const refresh = () => setRefreshToken((current) => current + 1);

  useEffect(() => {
    apiRequest<DemoUser[]>({ path: '/session/users', userId: '' })
      .then((users) => setSession((current) => ({ ...current, users })))
      .catch((error: unknown) => setSession((current) => ({ ...current, loadError: getErrorMessage(error) })));
  }, []);

  useEffect(() => {
    if (user) {
      apiRequest<CockpitConfig>({ path: '/config', userId: user.id })
        .then(setConfig)
        .catch(() => setConfig(null));
    }
  }, [user?.id]);

  useEffect(() => {
    if (user && !isEmployee) {
      apiRequest<Overview>({ path: '/overview', userId: user.id })
        .then(setOverview)
        .catch(() => setOverview(null));
    }
  }, [user?.id, isEmployee, refreshToken]);

  if (session.loadError) {
    return (
      <main className="page">
        <p className="callout callout-error" role="alert">
          The cockpit API is not reachable ({session.loadError}). Start it with npm run dev.
        </p>
      </main>
    );
  }

  if (!user) {
    return <main className="page muted">Loading cockpit…</main>;
  }

  return (
    <CockpitProvider
      value={{
        user,
        config,
        refreshToken,
        refresh,
        navigate,
        selectedAppId: navigation.selectedAppId,
        selectedIncidentId: navigation.selectedIncidentId,
      }}
    >
      <AppHeader users={session.users} onSelectUser={selectUser} activeView={activeView} overview={overview} />
      <main className="page">
        <ActiveView view={activeView} />
      </main>
    </CockpitProvider>
  );
};
