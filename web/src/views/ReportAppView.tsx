import { useState } from 'react';

import type { AppStatus, DataSensitivity } from '../../../shared/types';
import { ErrorCallout } from '../components/ErrorCallout';
import { StatusPill } from '../components/StatusPill';
import { appStatusLabels, appStatusTones } from '../format';
import { useMutation } from '../useMutation';
import { useResource } from '../useResource';

type CatalogApp = { id: string; name: string; domain: string; category: string; status: AppStatus };

type ReportForm = { appName: string; domain: string; purpose: string; dataSensitivity: DataSensitivity | '' };

const emptyForm: ReportForm = { appName: '', domain: '', purpose: '', dataSensitivity: '' };

export const ReportAppView = () => {
  const { data: catalog } = useResource<CatalogApp[]>('/apps/catalog');
  const { mutate, isPending, error } = useMutation<{ message: string }>();

  const [form, setForm] = useState<ReportForm>(emptyForm);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const updateField = (field: keyof ReportForm) => (value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submitReport = async () => {
    const result = await mutate({
      path: '/apps/report',
      body: {
        appName: form.appName,
        domain: form.domain,
        purpose: form.purpose,
        dataSensitivity: form.dataSensitivity || undefined,
      },
    });
    if (result) {
      setConfirmation(result.message);
      setForm(emptyForm);
    }
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Report an AI tool</h1>
          <p>Using an AI tool that is not in the catalog? Tell us and security will review it. Reporting is never penalized.</p>
        </div>
      </div>
      <div className="split">
        <div className="split-main">
          <section className="card" aria-labelledby="report-heading">
            <h2 id="report-heading">Tool details</h2>
            <label className="field">
              Tool name
              <input value={form.appName} onChange={(event) => updateField('appName')(event.target.value)} />
            </label>
            <label className="field">
              Website domain
              <input
                value={form.domain}
                onChange={(event) => updateField('domain')(event.target.value)}
                placeholder="tool.example"
              />
            </label>
            <label className="field">
              What do you use it for?
              <textarea value={form.purpose} onChange={(event) => updateField('purpose')(event.target.value)} />
            </label>
            <label className="field">
              Most sensitive data you have shared with it
              <select
                value={form.dataSensitivity}
                onChange={(event) => updateField('dataSensitivity')(event.target.value)}
              >
                <option value="">Not sure</option>
                <option value="none">None or public</option>
                <option value="internal">Internal</option>
                <option value="confidential">Confidential</option>
                <option value="regulated">Regulated (customer, health or financial)</option>
              </select>
            </label>
            <ErrorCallout message={error} />
            {confirmation ? (
              <p className="callout callout-success" role="status">
                {confirmation}
              </p>
            ) : null}
            <div className="button-row">
              <button type="button" className="button button-primary" onClick={submitReport} disabled={isPending}>
                Submit for review
              </button>
            </div>
          </section>
        </div>
        <div className="split-side">
          <section className="card" aria-labelledby="catalog-heading">
            <h2 id="catalog-heading">Approved AI tools</h2>
            {(catalog ?? []).map((app) => (
              <div key={app.id} className="inline">
                <strong>{app.name}</strong>
                <StatusPill tone={appStatusTones[app.status]}>{appStatusLabels[app.status]}</StatusPill>
                <span className="muted">{app.category}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    </>
  );
};
