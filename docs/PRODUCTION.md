# CaseFlow: path to production

## What this repository is

CaseFlow in this repository is a **sales and product demo**.

- It uses **synthetic data only**. Every patient, phone number, provider and value is fictional.
- **All external systems are simulated**: messaging, booking, practice-management import and the assistant. No message is ever sent.
- Data lives in the **viewer's browser** (`localStorage`). There is no server database, no authentication and no audit trail.
- It **does not claim compliance** with HIPAA, GDPR / UK GDPR, India's DPDP Act, the Australian Privacy Act, CQC or any other regulation or standard.

**Do not enter real patient information into this demo.**

What follows is the work required before CaseFlow could handle real patient data. It is a checklist for engineering, security and legal review, not a statement that any of it has been done.

---

## 1. Data and architecture

| Demo today | Required for production |
|---|---|
| State in `localStorage`, mutated client-side | Server-side repository (e.g. PostgreSQL / Supabase) behind authenticated API routes. The domain engine (`src/lib/domain`) is pure and can run server-side unchanged. |
| Client computes the scheduler on demand | A server job (cron / queue worker) runs `runDueFollowUps` every few minutes with idempotency keys so a step is never sent twice. |
| Single clinic | Multi-tenant model: every row carries `clinic_id`, enforced with row-level security. |
| Synthetic seed | No seed in production. Import plans from the practice-management system or enter them manually. |

Other requirements:

- Store timestamps in UTC and keep the clinic timezone per tenant (already modelled).
- Encrypt data in transit (TLS) and at rest. Consider field-level encryption for contact details.
- Keep patient-identifying data out of logs, analytics events and error reports.
- Separate environments (dev / staging / prod) with no production data in lower environments.

## 2. Authentication

- Staff sign-in with a managed identity provider. Support SSO for groups and MFA for every account.
- Session timeouts suitable for shared front-desk machines. Re-authenticate for sensitive actions such as exports or bulk campaigns.
- No patient accounts are needed. Patient interaction happens through the messaging channel. Any patient-facing booking link must use signed, expiring, single-purpose tokens.

## 3. Authorization (RBAC)

Suggested roles:

| Role | Can |
|---|---|
| Front desk | Work cases, reply, take over, book / reschedule / cancel, add notes |
| Practice manager | Everything above, plus approve and launch campaigns, edit templates and settings, see analytics |
| Clinician | Read cases, answer escalated clinical questions (outside the automated channel) |
| Owner / admin | Users, billing, integrations, data export and deletion |

Enforce these rules on the server, never only in the UI. Campaign approval should require a different user from the author.

## 4. Consent and contact rules

- Record consent per patient **and per channel**, with source, timestamp and wording shown. The demo models a single consent flag.
- Honour opt-out immediately and globally across channels and all of the patient's cases. Keep suppression lists even after other data is deleted.
- Use quiet hours in the clinic's timezone (modelled), plus frequency caps per patient.
- Use channel-specific requirements, for example:
  - **India:** TRAI commercial-communication rules (DLT registration of sender IDs and templates) for SMS, and WhatsApp Business template approval and opt-in.
  - **Australia:** Spam Act 2003 consent and unsubscribe requirements.
  - **UK:** PECR alongside UK GDPR.
  - **USA:** TCPA consent and carrier 10DLC registration for SMS.
- Keep message content administrative. Template validation blocks pressure wording and clinical claims. Production should add clinic sign-off on every template and keep template versions.

## 5. Clinical safety boundary

- The deterministic guardrail layer (opt-out, then clinical-question detection) must stay **in front of** any LLM and must not be configurable off.
- If a production LLM is added for administrative answers:
  - call it server-side only
  - give it only the clinic's configured knowledge
  - require grounded answers or the fixed fallback
  - log prompts and responses for review
  - red-team it regularly with clinical, pricing and manipulation prompts
- Clinical keyword detection is deliberately over-inclusive. Measure false negatives with a review set before go-live, and give staff a way to report misses.
- Human-handoff SLAs and alerting are needed so a "Needs Human" case is never left unattended.

## 6. Data retention and deletion

- Define retention periods per data class (cases, messages, notes, audit logs) with the clinic and counsel.
- Patient deletion / erasure requests: delete or anonymise across cases, messages, appointments and analytics aggregates, while keeping the opt-out suppression record.
- Data export for patients and for the clinic (portability).
- Backups follow the same retention and deletion rules.

## 7. Audit logging

The demo records a per-case activity history. Production needs an **append-only, tamper-evident audit log** covering:

- every message sent or received (with provider message IDs and delivery receipts)
- every status change, handoff, take-over and automation change, with the acting user
- settings and template changes (before and after), campaign approval and launch
- data views and exports of patient records, sign-ins and permission changes

## 8. Integrations (replace simulated providers)

| Interface | Production work |
|---|---|
| `MessagingProvider` | WhatsApp Business Platform / SMS / email adapters; inbound webhooks with signature verification; delivery and read receipts; retry with idempotency; template registration |
| `BookingProvider` | Read availability from and write to the PMS or calendar; re-validate the slot remotely at confirm time; handle conflicts and offline PMS |
| `PracticeManagementProvider` | Import presented-but-unscheduled plans; de-duplicate patients; map treatment codes to CaseFlow categories |
| `AssistantProvider` | Optional LLM behind the guardrail layer (see §5) |

Keep credentials in a server-side secret manager. **Never ship API keys to the browser.** Rotate keys and scope them to least privilege.

## 9. Vendor and security review

- A data processing agreement (DPA), or a Business Associate Agreement where HIPAA applies, with every sub-processor: hosting, database, messaging, LLM, email and monitoring.
- Data residency requirements per country.
- Threat model, dependency scanning, SAST, secret scanning, and a penetration test before launch.
- Security headers / CSP, rate limiting on webhooks and APIs, and protection against message-flooding abuse.

## 10. Legal and privacy review

Before handling real data, the operating company and each clinic should obtain legal advice on applicable law, including where relevant: India's DPDP Act 2023 and rules; Australia's Privacy Act 1988 / APPs; UK GDPR and the Data Protection Act 2018; HIPAA and state privacy laws in the USA; and professional advertising and communication guidance (for example the GDC, AHPRA and dental councils). Produce privacy notices, a DPIA or equivalent assessment, and clinic-facing terms.

## 11. Production monitoring

- Uptime and latency for the app, the scheduler and the webhooks.
- Message pipeline metrics: queued, sent, delivered, failed, opt-outs, and a dead-letter queue.
- Scheduler health: due-but-unsent backlog alarms.
- Handoff queue age alarms (Needs Human waiting longer than the SLA).
- Error tracking with PII scrubbing. Business dashboards built on aggregate data only.

## 12. Incident handling

- An incident response plan with severity levels, on-call rotation and escalation contacts.
- Breach notification procedures that meet each jurisdiction's timelines (for example the DPDP Board, the OAIC, the ICO and HHS / state regulators).
- A kill switch to pause all outbound messaging per clinic or globally.
- Post-incident reviews, with corrective actions tracked to completion.

---

## Financial figures

All revenue figures in the demo are **estimates** from clinic-entered plan values. The "Hypothetical before/after" panel is an illustration, not a measured result. Production analytics must keep this labelling, separate estimated plan value from collected revenue, and never present projections as customer outcomes.
