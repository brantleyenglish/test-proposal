import type { AppStatus, IncidentSeverity, IncidentStatus, TelemetrySource } from '../../shared/types';

export type Tone = 'good' | 'warning' | 'critical' | 'neutral' | 'info' | 'ai';

export const appStatusLabels: Record<AppStatus, string> = {
  'in-review': 'In review',
  approved: 'Approved',
  restricted: 'Restricted',
  blocked: 'Blocked',
};

export const appStatusTones: Record<AppStatus, Tone> = {
  'in-review': 'info',
  approved: 'good',
  restricted: 'warning',
  blocked: 'critical',
};

export const severityTones: Record<IncidentSeverity, Tone> = {
  low: 'neutral',
  medium: 'warning',
  high: 'critical',
  critical: 'critical',
};

export const incidentStatusLabels: Record<IncidentStatus, string> = {
  new: 'New',
  'awaiting-approval': 'Awaiting approval',
  contained: 'Contained',
  closed: 'Closed',
};

export const sourceLabels: Record<TelemetrySource, string> = {
  'defender-cloud-apps': 'Defender for Cloud Apps',
  'entra-id': 'Entra ID',
  'secure-web-gateway': 'Secure web gateway',
  'purview-dlp': 'Purview DLP',
  'browser-extension': 'Browser extension',
  'employee-report': 'Employee report',
};

export const formatDateTime = (isoDate: string) =>
  new Date(isoDate).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const formatPercent = ({ part, whole }: { part: number; whole: number }) =>
  whole === 0 ? '0%' : `${Math.round((part / whole) * 100)}%`;

export const shortHash = (hash: string) => `${hash.slice(0, 10)}…`;

export const formatAuditAction = (action: string) => action.replace(/[.-]/g, ' ');
