import type { ReactNode } from 'react';

import type { Tone } from '../format';

type StatusPillProps = { tone: Tone; children: ReactNode };

export const StatusPill = ({ tone, children }: StatusPillProps) => (
  <span className={`pill status-${tone}`}>{children}</span>
);
