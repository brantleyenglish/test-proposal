import { createContext, useContext, type ReactNode } from 'react';

import type { CockpitConfig, DemoUser } from '../../shared/types';

export type CockpitView = 'overview' | 'discovery' | 'approvals' | 'incidents' | 'audit' | 'report';

export type NavigationTarget = { view: CockpitView; appId?: string; incidentId?: string };

export type CockpitContextValue = {
  user: DemoUser;
  config: CockpitConfig | null;
  refreshToken: number;
  refresh: () => void;
  navigate: (target: NavigationTarget) => void;
  selectedAppId: string | null;
  selectedIncidentId: string | null;
};

const CockpitContext = createContext<CockpitContextValue | null>(null);

type CockpitProviderProps = { value: CockpitContextValue; children: ReactNode };

export const CockpitProvider = ({ value, children }: CockpitProviderProps) => (
  <CockpitContext.Provider value={value}>{children}</CockpitContext.Provider>
);

export const useCockpit = () => {
  const value = useContext(CockpitContext);
  if (!value) {
    throw new Error('useCockpit must be used inside CockpitProvider');
  }
  return value;
};
