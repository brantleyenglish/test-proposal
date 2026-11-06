# AI SecOps Cockpit

A working prototype of an AI Security Operations cockpit. It discovers employee AI usage, classifies the risk of each AI app, routes it for human review, and triages incidents with AI-assisted recommendations. Every security action waits for human approval, and every step lands in a hash-chained audit log.

Built for a hackathon. The connectors to Microsoft Defender for Cloud Apps, Entra ID, Purview DLP, the secure web gateway and Teams are **simulated**: events come in through the same ingest API a real connector would use, and executed actions return a simulated result instead of calling a tenant.

## Run it

Requires Node 20 or later (`.tool-versions` pins 22.18.0 for asdf).

```bash
npm install
npm run dev        # API on :3001, cockpit UI on http://localhost:5173
```

Production-style, with one process serving both the API and the built UI:

```bash
npm run build
npm start          # http://localhost:3001
```

Checks:

```bash
npm run verify     # tsc + vitest (31 tests, including the full demo flow end to end)
```

### Optional: Azure OpenAI

Recommendations come from a built-in rules engine by default, so the demo works offline. To use Azure OpenAI, copy `.env.example` to `.env` and set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` and `AZURE_OPENAI_DEPLOYMENT`. The header then shows `AI: Azure OpenAI · <deployment>`. If the call fails or times out (20 s), the cockpit falls back to the rules engine and records why in the audit log.

## Demo script (about 5 minutes)

The header's **Signed in as** menu switches between demo users. It stands in for Entra ID app roles; every permission is enforced on the server, not just hidden in the UI.

| User | Role | Can |
| --- | --- | --- |
| Dana Lee, Jordan Patel | SOC analyst | Ingest, triage, decide Low-tier reviews, approve operational actions |
| Sam Okafor | Security lead | Everything above, plus containment actions and lead-routed reviews |
| Riley Chen | GRC auditor | Read everything, verify the audit chain, change nothing |
| Alex Rivera | Employee | Report an AI tool, see the approved catalog |

1. **Detect.** As Dana, on Overview, simulate *Claims PHI uploaded to an unknown PDF summarizer*. Purview DLP reports the upload. The cockpit discovers `QuickSummary PDF`, scores it 73 (High, medium confidence), routes the review to a security lead, and opens an incident. The SSN, medical record number and email address in the event are redacted at ingest. Nothing is blocked automatically.
2. **Classify.** Click *View classification*. Each of the six risk factors shows its points and its evidence. The three factors with no telemetry yet are hatched as *estimated* and scored conservatively.
3. **Recommend.** Click *Triage incident*, then *Generate recommendation*. The AI proposes block, coach, DLP rule and ticket. It may only choose from an allowlist, and policy, not the model, decides which role must approve each action.
4. **Approve.** As Dana, try *Approve and run* on *Block the app*. The server refuses: containment needs a security lead. Switch to Sam, give a rationale, and approve. The simulated Defender for Cloud Apps result appears and the app becomes Blocked.
5. **Audit.** Switch to Riley. The incident's audit history shows every step with actor, rationale and hash. The Audit log tab verifies the whole chain.
6. **Two-person rule (bonus).** Simulate *AI email agent granted mailbox write access*. It scores Critical, so the review needs two distinct approvers, one of them a lead. A second analyst is refused.
7. **Incomplete telemetry (bonus).** Simulate *Unknown AI API seen by the gateway only*. Five of six factors are estimated, so confidence is low and the review goes to a lead even though the score is Moderate.
8. **Self-report (bonus).** As Alex, report a tool. It enters the same pipeline as a detected app.

**Reset demo** (Sam only) restores the seed data.

## How it meets the constraints

| Constraint | Design |
| --- | --- |
| Incomplete telemetry | Every risk factor has an explicit unknown state, scored conservatively and flagged as estimated. Missing factors lower assessment confidence, and low confidence routes the review to a lead. Overview shows telemetry coverage per source. |
| Sensitive data | Only pseudonymous user IDs are stored. Free text is redacted at ingest (emails, SSNs, card numbers, medical record numbers, phone numbers), and the context is redacted again before it reaches the model. A test asserts that no raw identifier is sent to Azure OpenAI. |
| Strict access controls | Role permissions are checked server-side on every request. Reviews are routed by tier, Critical reviews need two distinct approvers, and auditors are read-only. |
| Human approval before any security action | Detection and classification never enforce anything. Recommendations only propose; each action needs a named approver with the right role and a written rationale before the simulated connector runs. |
| Accountability | An append-only audit log where each entry carries the SHA-256 of the previous one. Verification detects edits and deletions. |

## Layout

```
shared/types.ts            Domain model shared by API and UI
server/
  app.ts                   Express routes, validation (zod), demo identity
  cockpit.ts               Discovery, classification, routing, triage, approvals
  riskScoring.ts           Six-factor risk model, tiers, review routing
  recommendations.ts       Rules engine + Azure OpenAI client (REST, JSON mode)
  connectors.ts            Action policy (impact, required role) + simulated connectors
  redaction.ts             PII redaction
  auditLog.ts              Hash-chained audit log + verification
  authorization.ts         Roles, permissions, separation of duties
  seed.ts                  Demo users, seeded apps, simulation scenarios
  __tests__/               Unit tests + end-to-end demo flow
web/src/                   React cockpit (views/, components/)
```

## API

All routes except `/api/health` and `/api/session/users` need an `x-demo-user-id` header.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/telemetry` | Ingest a connector event (the integration point for real connectors) |
| POST | `/api/telemetry/simulate` | Ingest a scripted scenario |
| POST | `/api/apps/report` | Employee self-report |
| GET | `/api/apps`, `/api/apps/:id` | Inventory, and one app with its risk factors, review and audit history |
| GET / POST | `/api/reviews`, `/api/reviews/:id/decisions` | Approval queue, record a decision |
| GET | `/api/incidents`, `/api/incidents/:id` | Incidents, and one incident with its audit history |
| POST | `/api/incidents/:id/recommendation` | Generate an AI recommendation |
| POST | `/api/incidents/:id/actions/:actionId/decision` | Approve or reject a proposed action |
| GET | `/api/audit`, `/api/audit/verify` | Audit log and chain verification |

## Prototype limits

- State is in memory and resets when the server restarts. A production build would use Azure SQL or Cosmos DB, with the audit log written to immutable storage (for example, Azure Blob Storage with a time-based retention policy).
- The identity switcher is demo-only. Production would validate Entra ID tokens and map app roles to these permissions.
- Connectors are simulated. Real ones would pull from the Defender for Cloud Apps, Microsoft Graph and Purview APIs, and push decisions back through the same APIs.
