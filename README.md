# CaseFlow

**Recover treatment patients haven't scheduled yet.**

CaseFlow is the third module in a dental revenue suite:

| Module | Job |
|---|---|
| ConsultFlow | New enquiry → booked consultation |
| ChairFill | Cancellation / open chair → filled appointment |
| **CaseFlow** | **Treatment plan → scheduled treatment** |

> **This is a sales demo.** All data is synthetic and every external system is simulated. Nothing is sent to anyone. It is not a production healthcare system and makes no regulatory compliance claims. See [docs/PRODUCTION.md](docs/PRODUCTION.md).

## The business problem

A dentist presents a treatment plan. The patient leaves without booking. Without a consistent follow-up process, staff forget, patients postpone, and the plan quietly becomes lost revenue.

CaseFlow gives the front desk a structured, human-controlled follow-up workflow:

- every unscheduled plan becomes a **case** with a clear status and next step
- a configurable **follow-up sequence** (Day 0, 2, 5, 10) sends administrative reminders
- patients can **book a slot**, ask to be contacted, say **not now**, or **stop messages**
- **clinical questions are never answered automatically**: they go to staff
- deferred patients can be **reactivated** later through an approved campaign
- managers see **conversion and estimated recovered value**, clearly labelled as estimates

CaseFlow handles administration only. The dentist decides what treatment is clinically appropriate.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev
# open http://localhost:3000
```

No environment variables, API keys or database are needed. The demo seeds itself in your browser on first load.

### Demo mode

- The amber **Demo mode** button in the top bar shows the demo clock and lets you:
  - **Run scheduler now**: sends follow-up steps that are due. In production this runs on the server every few minutes.
  - **Advance demo clock 1 day**: moves time forward and runs the scheduler, so you can watch a sequence progress.
  - **Reset demo data**: restores the original SmileCare Dental story.
- Every conversation has a **Simulate patient (demo)** tab. Use it to play the patient: tap quick replies, pick an offered time, or type a message. Simulated replies go through the same guardrails a real message would.
- State is stored in your browser's `localStorage`, so each viewer has their own sandbox. There are no logins in demo mode.
- Automated messages respect quiet hours (21:00–09:00 clinic time). If you run the scheduler at night, due steps are held until 09:00. Staff-initiated sends (Start follow-up, Send next step now) are not held.

### The 60-second story

1. **Dashboard**: what is waiting for action and how much opportunity was recovered (estimate).
2. **Treatment Plans → Rahul Verma**: the patient has not scheduled. **Open follow-up case**.
3. **Start follow-up**: CaseFlow sends the Day 0 message (simulated).
4. In **Simulate patient**, tap **Book treatment**. Available slots appear. Pick one.
5. The case becomes **Scheduled**. The appointment, timeline, dashboard and analytics all update.

## Main workflows

| Workflow | Where |
|---|---|
| Add a plan / import from the practice system (simulated) | Treatment Plans |
| Worklist sorted by urgency (needs human → unread → due → pending) | Cases |
| Case detail: next step, conversation, appointment, sequence, notes, activity history | Cases → a patient |
| Take over / Return to automation / Mark needs human / Stop automation | Conversation header |
| Follow-up queue: due today, next 7 days, paused, ready to start | Follow-ups |
| Reactivation of deferred patients; bulk follow-up campaigns with approval and simulated launch | Campaigns |
| Book, reschedule, cancel, mark attended; provider calendar | Appointments, case detail |
| Funnel, weekly trend, categories, step performance, reactivation, ROI demo calculation | Analytics |
| Clinic info, hours, booking rules, providers, services, categories, sequence timing, templates, knowledge/FAQs, consent, escalation, notifications | Settings |

### Case statuses

`Pending → Follow-up Active → Engaged → Scheduled → Completed`, plus `Needs Human`, `Deferred`, `Lost` and `Do Not Contact`. Transitions are enforced by a state machine (`src/lib/domain/status.ts`).

Automation is tracked separately from status (`running`, `paused`, `staff`, `stopped`, `finished`). It stops automatically when the patient books, opts out, asks a clinical question, or staff take over or stop it. A plan only counts as **recovered** if it was scheduled after at least one CaseFlow follow-up message.

### Guardrails

- **Opt-out** (`STOP`, "unsubscribe", "please stop messaging me"…) is checked first and always honoured. It blocks all further messages, including staff messages.
- **Clinical questions** ("Will this hurt?", "Do I really need this?", "Can this heal on its own?"…) are detected before any answering. The assistant replies with a fixed handoff message, the case moves to **Needs Human**, and automation pauses.
- **Administrative answers** come only from Settings → Clinic knowledge / FAQs / hours / address. Missing information, and any price question, gets: *"I don't have that information. I can have the clinic team help you."*
- **Message templates** are validated: empty text, malformed or unsupported placeholders, missing required placeholders, pressure wording ("last chance", "must book") and clinical claims are blocked.

## Architecture

```
src/
  app/                  Next.js App Router pages (thin wrappers)
  features/             Screen-level components (dashboard, plans, case detail, campaigns…)
  components/           Design-system primitives, status badges, charts, app shell
  lib/
    domain/             Pure TypeScript domain layer (no React)
      types.ts          Entities: Patient, TreatmentPlan, Case, Message, Appointment, Campaign, Settings
      status.ts         Case state machine
      engine.ts         Workflow engine: follow-up, conversation, booking, campaigns, opt-out
      assistant.ts      Guardrails + administrative answering
      slots.ts          Availability and conflict detection
      templates.ts      Template rendering and validation
      analytics.ts      Funnel, trend, category, step, reactivation, ROI
      time.ts           Timezone-aware helpers (Intl, no date library)
      countries.ts      IN / AU / GB / US profiles (currency, locale, timezone, channel, review notes)
    integrations/       Provider interfaces + simulated demo implementations
    demo/seed.ts        Synthetic SmileCare Dental story, replayed through the engine
    store.ts            Browser demo repository (Zustand + localStorage)
```

Every engine function takes `(state, …, now)` and mutates a cloned draft. That gives three things:

- **Testable**: the full workflow runs in unit tests with a fixed clock.
- **Consistent seed**: the demo data is generated by replaying synthetic activity through the real engine at past timestamps, so seeded statuses, messages and metrics match live behaviour.
- **Portable**: the same engine can run server-side behind an API with a database repository.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Zustand, Phosphor icons, Geist font. Tests: Vitest (domain) and Playwright (end-to-end).

India-first defaults (INR, en-IN, Asia/Kolkata, WhatsApp). Country, currency, locale, timezone and channels are settings, not hard-coded. Selecting Australia, UK or USA in Settings → Clinic switches the defaults.

## Simulated integrations

| Interface (`src/lib/integrations/types.ts`) | Demo implementation | Future production adapter |
|---|---|---|
| `MessagingProvider` | Marks messages delivered; nothing leaves the browser | WhatsApp Business Platform, SMS gateway (with DLT / 10DLC as applicable), email |
| `BookingProvider` | CaseFlow's own calendar with conflict checks | Practice-management or calendar API, re-validating slots remotely |
| `PracticeManagementProvider` | Returns synthetic unscheduled plans | Practice-management system API or scheduled export |
| `AssistantProvider` | Rule-based, deterministic | LLM provider called server-side, given only configured clinic knowledge; guardrails stay in the domain layer and run first |

## Testing

```bash
npm run typecheck     # TypeScript
npm run lint          # ESLint
npm test              # Vitest unit/integration tests for the domain layer and settings validation
npm run test:e2e      # Playwright: builds, starts on :3100 and runs the acceptance story + responsive checks
npm run check         # typecheck + lint + unit tests
```

Playwright uses the installed Chromium. If you need to install a browser locally: `npx playwright install chromium`.

## Build and deploy

```bash
npm run build
npm start             # serves the production build on :3000
```

The app is fully client-side at runtime, with no server secrets, so it deploys to any Next.js host (Vercel, Netlify, a Node container). No environment variables are required.

## Future production integrations

See [docs/PRODUCTION.md](docs/PRODUCTION.md) for what must change before real patient data is handled: authentication, RBAC, a server-side database, consent records, audit logging, messaging compliance, data retention, vendor review, monitoring and incident handling.
