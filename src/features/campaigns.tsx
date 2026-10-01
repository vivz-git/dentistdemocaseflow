"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { CheckCircle, MegaphoneSimple, Pause, Play, RocketLaunch, Sparkle, Stop, WarningCircle } from "@phosphor-icons/react";
import { CHANNEL_LABEL } from "@/lib/domain/countries";
import { PRACTICE_MANAGER, TEMPLATE_VARIABLES } from "@/lib/domain/defaults";
import {
  ACTION_LABEL,
  approveCampaign,
  campaignStats,
  caseContext,
  createCampaign,
  followUpEligibility,
  launchCampaign,
  pauseCampaign,
  reactivationEligibility,
  resumeCampaign,
  simulateCampaignResponses,
  stopCampaign,
  templateVars,
  updateCampaignDraft,
} from "@/lib/domain/engine";
import { formatDate, formatDateTime, formatMoney, formatRelative } from "@/lib/domain/format";
import { STATUS_LABEL } from "@/lib/domain/status";
import { renderTemplate, validateTemplate } from "@/lib/domain/templates";
import type { Campaign, CampaignStatus, Channel, DemoState, RecipientState } from "@/lib/domain/types";
import { useDemoState, useNow, useStore } from "@/lib/store";
import { StatusBadge } from "@/components/status";
import { Badge, Button, ButtonLink, Card, CardHeader, Dialog, Dl, EmptyState, Field, Input, PageHeader, Segmented, Select, Textarea } from "@/components/ui";

const CAMPAIGN_STATUS: Record<CampaignStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-subtle text-ink-2 ring-1 ring-inset ring-line-strong" },
  approved: { label: "Approved", className: "bg-info-soft text-[#174ea6]" },
  running: { label: "Running", className: "bg-brand-soft text-brand-ink" },
  paused: { label: "Paused", className: "bg-warn-soft text-[#8a4b04]" },
  stopped: { label: "Stopped", className: "bg-[#f3eeee] text-[#7a3b39]" },
  completed: { label: "Completed", className: "bg-brand text-white" },
};

const RECIPIENT_LABEL: Record<RecipientState, string> = {
  queued: "Queued",
  skipped: "Skipped",
  delivered: "Delivered · no reply",
  replied: "Replied",
  scheduled: "Scheduled",
  opted_out: "Opted out",
  needs_human: "Needs human",
  deferred: "Not now",
};

function CampaignStatusBadge({ status }: { status: CampaignStatus }) {
  return <Badge className={CAMPAIGN_STATUS[status].className}>{CAMPAIGN_STATUS[status].label}</Badge>;
}

function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  const h = ms / 3_600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${h.toFixed(1)} h` : `${Math.round(h / 24)} days`;
}

/* ------------------------------------------------------------------ */
/* List                                                                */
/* ------------------------------------------------------------------ */

export function CampaignsList() {
  const s = useDemoState();
  const now = useNow();
  const eligible = s.cases.filter((c) => reactivationEligibility(s, c, now).eligible).length;
  const campaigns = s.campaigns.slice().reverse();
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Send one approved message to a group of eligible patients. Every send in this demo is simulated."
        actions={
          <>
            <ButtonLink href="/campaigns/new?kind=follow_up">New follow-up campaign</ButtonLink>
            <ButtonLink href="/campaigns/new?kind=reactivation" variant="primary" icon={<MegaphoneSimple size={16} />}>
              New reactivation
            </ButtonLink>
          </>
        }
      />
      {eligible > 0 && (
        <Card className="mb-4 flex flex-col gap-3 border-brand/25 bg-brand-soft/50 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5 lg:mb-5">
          <div className="flex-1">
            <p className="text-[15px] font-semibold text-brand-ink">
              {eligible} deferred patient{eligible === 1 ? " is" : "s are"} ready for a reactivation check-in
            </p>
            <p className="text-[13px] text-brand-ink/80">Their waiting period has ended and they have not opted out.</p>
          </div>
          <ButtonLink href="/campaigns/new?kind=reactivation" variant="primary">
            Review eligible patients
          </ButtonLink>
        </Card>
      )}
      <Card>
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" action={<ButtonLink href="/campaigns/new?kind=reactivation" variant="primary">Create a reactivation campaign</ButtonLink>}>
            Reactivation campaigns check in with patients who deferred treatment.
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Campaign</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Recipients</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Sent</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Replied</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Scheduled</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Opted out</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Needs human</th>
                    <th scope="col" className="py-2.5 pr-5 pl-3 font-medium">Approver</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {campaigns.map((c) => {
                    const st = campaignStats(s, c.id)!;
                    return (
                      <tr key={c.id} className="group relative hover:bg-subtle">
                        <td className="py-3 pr-3 pl-5">
                          <Link href={`/campaigns/${c.id}`} className="font-medium text-ink no-underline after:absolute after:inset-0 group-hover:underline">
                            {c.name}
                          </Link>
                          <p className="text-[12px] text-muted">
                            {c.kind === "reactivation" ? "Reactivation" : "Follow-up"} · {CHANNEL_LABEL[c.channel]} · Simulated ·{" "}
                            {c.launchedAt ? `launched ${formatRelative(c.launchedAt, now, s.settings)}` : `created ${formatRelative(c.createdAt, now, s.settings)}`}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          <CampaignStatusBadge status={c.status} />
                        </td>
                        <td className="tnum px-3 py-3 text-right">{st.recipients}</td>
                        <td className="tnum px-3 py-3 text-right">{st.sent}</td>
                        <td className="tnum px-3 py-3 text-right">{st.replied}</td>
                        <td className="tnum px-3 py-3 text-right font-semibold text-brand">{st.scheduled}</td>
                        <td className="tnum px-3 py-3 text-right">{st.optedOut}</td>
                        <td className="tnum px-3 py-3 text-right">{st.needsHuman}</td>
                        <td className="py-3 pr-5 pl-3 text-ink-2">{c.approval.approvedBy ?? <span className="text-faint">Not approved</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line lg:hidden">
              {campaigns.map((c) => {
                const st = campaignStats(s, c.id)!;
                return (
                  <li key={c.id}>
                    <Link href={`/campaigns/${c.id}`} className="flex flex-col gap-1.5 px-4 py-3 no-underline hover:bg-subtle">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-sm font-medium text-ink">{c.name}</p>
                        <CampaignStatusBadge status={c.status} />
                      </div>
                      <p className="text-[12.5px] text-muted">
                        {st.recipients} recipients · {st.replied} replied · <span className="font-medium text-brand">{st.scheduled} scheduled</span>
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function CampaignBuilder() {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const router = useRouter();
  const params = useSearchParams();
  const kind = params.get("kind") === "follow_up" ? "follow_up" : "reactivation";
  const defaultTemplate = kind === "reactivation" ? "tpl_reactivation" : "tpl_initial";
  const [name, setName] = useState(kind === "reactivation" ? "Deferred patients — check-in" : "Pending plans — follow-up");
  const [templateId, setTemplateId] = useState(defaultTemplate);
  const [body, setBody] = useState(s.settings.templates.find((t) => t.id === defaultTemplate)?.body ?? "");
  const [channel, setChannel] = useState<Channel>(s.settings.channels.default);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showIneligible, setShowIneligible] = useState(false);

  const candidates = useMemo(() => {
    const statuses = kind === "reactivation" ? ["deferred", "lost"] : ["pending"];
    return s.cases
      .filter((c) => statuses.includes(c.status))
      .map((c) => ({ c, e: kind === "reactivation" ? reactivationEligibility(s, c, now) : followUpEligibility(s, c), ctx: caseContext(s, c) }))
      .filter((x) => categoryFilter === "all" || x.ctx.category.id === categoryFilter);
  }, [s, kind, now, categoryFilter]);

  const eligibleIds = candidates.filter((x) => x.e.eligible).map((x) => x.c.id);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligibleIds));
  const chosen = candidates.filter((x) => x.e.eligible && selected.has(x.c.id));
  const validation = validateTemplate(body);
  const previewCase = chosen[0]?.c ?? candidates[0]?.c;
  const preview = previewCase ? renderTemplate(body, templateVars(s, previewCase)) : body;
  const shown = showIneligible ? candidates : candidates.filter((x) => x.e.eligible);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    const r = act(
      (d, n) =>
        createCampaign(
          d,
          { name, kind, categoryIds: categoryFilter === "all" ? [] : [categoryFilter], caseIds: chosen.map((x) => x.c.id), body, channel },
          n,
        ),
      "Draft saved. Review and approve it before launch.",
    );
    if (r.ok) router.push(`/campaigns/${r.value.id}`);
  };

  return (
    <>
      <PageHeader
        back={{ href: "/campaigns", label: "Campaigns" }}
        title={kind === "reactivation" ? "New reactivation campaign" : "New follow-up campaign"}
        description={
          kind === "reactivation"
            ? "Check in with patients who deferred treatment and whose waiting period has ended."
            : "Start follow-up for pending plans in one step, with a message approved for this group."
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:gap-5">
          <Card>
            <CardHeader
              title="1. Choose recipients"
              description={`${chosen.length} selected of ${eligibleIds.length} eligible`}
              action={
                <label className="w-56">
                  <span className="sr-only">Treatment category</span>
                  <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="all">All treatment categories</option>
                    {s.settings.categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </label>
              }
            />
            <div className="flex flex-wrap items-center gap-3 border-y border-line bg-subtle/60 px-4 py-2 text-[12.5px] sm:px-5">
              <button type="button" className="font-medium text-brand hover:underline" onClick={() => setSelected(new Set(eligibleIds))}>
                Select all eligible
              </button>
              <button type="button" className="font-medium text-ink-2 hover:underline" onClick={() => setSelected(new Set())}>
                Clear
              </button>
              <label className="ml-auto inline-flex items-center gap-2 text-ink-2">
                <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={showIneligible} onChange={(e) => setShowIneligible(e.target.checked)} />
                Show patients not yet eligible
              </label>
            </div>
            {shown.length === 0 ? (
              <EmptyState title="No eligible patients">
                {kind === "reactivation"
                  ? "Deferred patients become eligible when their reactivation date passes. Patients who opted out are never included."
                  : "Every pending plan already has follow-up started."}
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {shown.map(({ c, e, ctx }) => (
                  <li key={c.id}>
                    <label className={clsx("flex items-start gap-3 px-4 py-3 sm:px-5", e.eligible ? "cursor-pointer hover:bg-subtle" : "opacity-60")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--color-brand)]"
                        disabled={!e.eligible}
                        checked={e.eligible && selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-ink">
                            {ctx.patient.firstName} {ctx.patient.lastName}
                          </span>
                          <StatusBadge status={c.status} />
                        </span>
                        <span className="block text-[12.5px] text-muted">
                          {ctx.category.name} · {formatMoney(ctx.plan.estimatedValue, s.settings)} · {CHANNEL_LABEL[ctx.patient.preferredChannel]}
                        </span>
                        <span className={clsx("block text-[12px]", e.eligible ? "text-brand" : "text-warn")}>
                          {e.reason}
                          {(e as { from?: string }).from ? ` · ${e.eligible ? "since" : "from"} ${formatDate((e as { from?: string }).from!, s.settings)}` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="2. Write the message" description="Administrative wording only. No pressure, no clinical claims." />
            <div className="grid gap-4 px-4 pb-5 sm:grid-cols-2 sm:px-5">
              <Field label="Campaign name" htmlFor="camp-name">
                <Input id="camp-name" value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="Channel" htmlFor="camp-channel" hint="Simulated in demo mode.">
                <Select id="camp-channel" value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                  {s.settings.channels.enabled.map((ch) => (
                    <option key={ch} value={ch}>
                      {CHANNEL_LABEL[ch]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Start from template" htmlFor="camp-template" className="sm:col-span-2">
                <Select
                  id="camp-template"
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setBody(s.settings.templates.find((t) => t.id === e.target.value)?.body ?? "");
                  }}
                >
                  {s.settings.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <MessageEditor id="camp-body" value={body} onChange={setBody} className="sm:col-span-2" />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader title="3. Preview" />
            <div className="px-4 pb-5 sm:px-5">
              <MessagePreview body={preview} />
              <Dl
                className="mt-4"
                items={[
                  { label: "Recipients", value: `${chosen.length} patient${chosen.length === 1 ? "" : "s"}` },
                  { label: "Preview for", value: previewCase ? `${caseContext(s, previewCase).patient.firstName} ${caseContext(s, previewCase).patient.lastName}` : "—" },
                  { label: "Channel", value: `${CHANNEL_LABEL[channel]} (simulated)` },
                  { label: "Campaign", value: name || "—" },
                  { label: "Approval", value: "Not yet approved" },
                ]}
              />
              <ValidationSummary v={validation} />
              <Button variant="primary" className="mt-4 w-full" disabled={!chosen.length || !name.trim()} onClick={save}>
                Save draft for approval
              </Button>
              {!chosen.length && <p className="mt-2 text-[12px] text-muted">Select at least one eligible patient.</p>}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

export function MessageEditor({ id, value, onChange, className }: { id: string; value: string; onChange: (v: string) => void; className?: string }) {
  const v = validateTemplate(value);
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        Message
      </label>
      <Textarea id={id} value={value} onChange={(e) => onChange(e.target.value)} rows={5} aria-invalid={!v.ok || undefined} aria-describedby={`${id}-vars`} />
      <div id={`${id}-vars`} className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
        <span>Insert:</span>
        {TEMPLATE_VARIABLES.map((tv) => (
          <button
            key={tv.key}
            type="button"
            onClick={() => onChange(`${value}${value.endsWith(" ") || !value ? "" : " "}{{${tv.key}}}`)}
            className="rounded-md border border-line bg-subtle px-1.5 py-0.5 font-mono text-[11.5px] text-ink-2 hover:border-line-strong"
            title={tv.label}
          >
            {`{{${tv.key}}}`}
          </button>
        ))}
      </div>
      <p className="text-[12px] text-faint">{value.length} / 1,000 characters</p>
    </div>
  );
}

export function ValidationSummary({ v }: { v: ReturnType<typeof validateTemplate> }) {
  return (
    <div className="mt-4 flex flex-col gap-1.5" aria-live="polite">
      {v.ok ? (
        <p className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand">
          <CheckCircle size={16} weight="fill" /> Message passes validation
        </p>
      ) : (
        v.errors.map((e) => (
          <p key={e} className="flex items-start gap-1.5 text-[13px] text-danger" role="alert">
            <WarningCircle size={16} weight="fill" className="mt-px shrink-0" /> {e}
          </p>
        ))
      )}
      {v.warnings.map((w) => (
        <p key={w} className="flex items-start gap-1.5 text-[12.5px] text-warn">
          <WarningCircle size={15} className="mt-px shrink-0" /> {w}
        </p>
      ))}
    </div>
  );
}

function MessagePreview({ body }: { body: string }) {
  return (
    <div className="rounded-xl bg-subtle p-3">
      <div className="ml-auto max-w-[92%] rounded-2xl rounded-tr-md bg-brand-soft px-3.5 py-2.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-brand-ink">
        {body || <span className="text-muted">Message preview</span>}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.values(ACTION_LABEL).map((a) => (
            <span key={a} className="rounded-full border border-brand/25 bg-white/70 px-2.5 py-0.5 text-[12px] font-medium">
              {a}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

export function CampaignDetail({ id }: { id: string }) {
  const s = useDemoState();
  const now = useNow();
  const act = useStore((x) => x.act);
  const camp = s.campaigns.find((c) => c.id === id);
  const [approver, setApprover] = useState(PRACTICE_MANAGER);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [tab, setTab] = useState<"recipients" | "activity">("recipients");

  if (!camp) {
    return (
      <Card>
        <EmptyState title="Campaign not found" action={<ButtonLink href="/campaigns">Back to campaigns</ButtonLink>} />
      </Card>
    );
  }
  const st = campaignStats(s, camp.id)!;
  const v = validateTemplate(editing ?? camp.body);
  const firstCase = s.cases.find((c) => c.id === camp.recipients[0]?.caseId);
  const preview = firstCase ? renderTemplate(editing ?? camp.body, templateVars(s, firstCase)) : camp.body;
  const value = camp.recipients
    .filter((r) => r.state === "scheduled")
    .reduce((sum, r) => sum + (caseContext(s, s.cases.find((c) => c.id === r.caseId)!).plan.estimatedValue ?? 0), 0);

  return (
    <>
      <PageHeader
        back={{ href: "/campaigns", label: "Campaigns" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {camp.name} <CampaignStatusBadge status={camp.status} />
          </span>
        }
        description={`${camp.kind === "reactivation" ? "Reactivation" : "Follow-up"} · ${CHANNEL_LABEL[camp.channel]} · Mode: simulated (demo) · created by ${camp.createdBy}`}
        actions={<CampaignActions camp={camp} onLaunch={() => setLaunchOpen(true)} />}
      />

      <Card className="mb-4 lg:mb-5">
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4 xl:grid-cols-8">
          {[
            ["Recipients", st.recipients],
            ["Messages", st.messages],
            ["Sent", st.sent],
            ["Delivered", st.delivered],
            ["Replied", st.replied],
            ["Scheduled", st.scheduled],
            ["Opted out", st.optedOut],
            ["Needs human", st.needsHuman],
          ].map(([label, val]) => (
            <div key={label as string} className="bg-surface px-4 py-3">
              <dt className="text-[12px] text-muted">{label}</dt>
              <dd className={clsx("mt-0.5 text-xl font-semibold", label === "Scheduled" ? "text-brand" : "text-ink")}>{val}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-4 py-2.5 text-[12.5px] text-muted sm:px-5">
          <span>
            Average reply time: <span className="font-medium text-ink">{fmtDuration(st.avgReplyMs)}</span>
          </span>
          <span>
            Skipped at launch: <span className="font-medium text-ink">{st.skipped}</span>
          </span>
          <span>
            Estimated value scheduled: <span className="font-medium text-ink">{formatMoney(value, s.settings)}</span> (estimate · demo data)
          </span>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
        <Card className="min-w-0">
          <div className="border-b border-line px-4 py-3 sm:px-5">
            <Segmented
              label="Campaign detail"
              value={tab}
              onChange={setTab}
              options={[
                { value: "recipients", label: "Recipients", count: camp.recipients.length },
                { value: "activity", label: "Activity", count: camp.activity.length },
              ]}
            />
          </div>
          {tab === "recipients" ? <RecipientList s={s} camp={camp} now={now} /> : <ActivityList s={s} camp={camp} />}
        </Card>

        <div className="flex flex-col gap-4 lg:gap-5">
          <Card>
            <CardHeader
              title="Message"
              action={
                camp.status === "draft" || camp.status === "approved" ? (
                  editing === null ? (
                    <Button size="sm" variant="ghost" onClick={() => setEditing(camp.body)}>
                      Edit
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        if (act((d) => updateCampaignDraft(d, camp.id, { body: editing }), camp.status === "approved" ? "Message updated. Approval was reset." : "Message updated.").ok) setEditing(null);
                      }}
                    >
                      Save message
                    </Button>
                  )
                ) : undefined
              }
            />
            <div className="px-4 pb-5 sm:px-5">
              {editing !== null ? <MessageEditor id="detail-body" value={editing} onChange={setEditing} /> : <MessagePreview body={preview} />}
              <ValidationSummary v={v} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Approval" description="A practice manager approves every campaign before launch." />
            <div className="px-4 pb-5 sm:px-5">
              {camp.approval.approvedBy ? (
                <p className="inline-flex items-center gap-2 text-[13px] text-ink">
                  <CheckCircle size={18} weight="fill" className="text-brand" />
                  Approved by <span className="font-medium">{camp.approval.approvedBy}</span> · {formatDateTime(camp.approval.approvedAt!, s.settings)}
                </p>
              ) : (
                <div className="flex flex-col gap-3">
                  <Field label="Approver" htmlFor="approver">
                    <Input id="approver" value={approver} onChange={(e) => setApprover(e.target.value)} />
                  </Field>
                  <Button
                    variant="primary"
                    disabled={!v.ok || editing !== null}
                    onClick={() => act((d, n) => approveCampaign(d, camp.id, approver, n), "Campaign validated and approved. Ready for simulated launch.")}
                  >
                    Validate & approve
                  </Button>
                  {!v.ok && <p className="text-[12px] text-danger">Fix the message before approval.</p>}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Dialog
        open={launchOpen}
        onClose={() => setLaunchOpen(false)}
        title="Launch campaign (simulated)"
        description="Nothing is sent outside this demo. Each recipient is re-checked for eligibility and consent at launch."
        footer={
          <>
            <Button onClick={() => setLaunchOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={<RocketLaunch size={16} />}
              onClick={() => {
                const r = act((d, n) => launchCampaign(d, camp.id, n), (x) => `Simulated launch: ${x.sent} sent${x.skipped ? `, ${x.skipped} skipped` : ""}.`);
                if (r.ok) setLaunchOpen(false);
              }}
            >
              Launch simulated send
            </Button>
          </>
        }
      >
        <MessagePreview body={preview} />
        <Dl
          className="mt-4"
          items={[
            { label: "Recipients", value: `${camp.recipients.length}` },
            { label: "Channel", value: `${CHANNEL_LABEL[camp.channel]} (simulated)` },
            { label: "Campaign", value: camp.name },
            { label: "Approval", value: camp.approval.approvedBy ? `Approved by ${camp.approval.approvedBy}` : "Not approved" },
          ]}
        />
      </Dialog>
    </>
  );
}

function CampaignActions({ camp, onLaunch }: { camp: Campaign; onLaunch: () => void }) {
  const act = useStore((x) => x.act);
  return (
    <>
      {camp.status === "approved" && (
        <Button variant="primary" icon={<RocketLaunch size={16} />} onClick={onLaunch}>
          Launch (simulated)
        </Button>
      )}
      {(camp.status === "running" || camp.status === "paused") && (
        <Button
          variant="primary"
          icon={<Sparkle size={16} />}
          onClick={() =>
            act(
              (d, n) => simulateCampaignResponses(d, camp.id, n),
              (o) => `Simulated replies: ${o.booked} booked, ${o.questions} questions, ${o.needsHuman} to staff, ${o.deferred} not now, ${o.optedOut} opted out.`,
            )
          }
        >
          Simulate patient replies
        </Button>
      )}
      {camp.status === "running" && (
        <Button icon={<Pause size={16} />} onClick={() => act((d, n) => pauseCampaign(d, camp.id, n), "Campaign paused.")}>
          Pause
        </Button>
      )}
      {camp.status === "paused" && (
        <Button icon={<Play size={16} />} onClick={() => act((d, n) => resumeCampaign(d, camp.id, n), "Campaign resumed.")}>
          Resume
        </Button>
      )}
      {["draft", "approved", "running", "paused"].includes(camp.status) && (
        <Button variant="danger" icon={<Stop size={16} />} onClick={() => act((d, n) => stopCampaign(d, camp.id, n), "Campaign stopped. No further automated messages.")}>
          Stop
        </Button>
      )}
    </>
  );
}

function RecipientList({ s, camp, now }: { s: DemoState; camp: Campaign; now: Date }) {
  return (
    <ul className="divide-y divide-line">
      {camp.recipients.map((r) => {
        const c = s.cases.find((x) => x.id === r.caseId)!;
        const { patient, category } = caseContext(s, c);
        return (
          <li key={r.caseId}>
            <Link href={`/cases/${c.id}`} className="flex flex-col gap-1 px-4 py-3 no-underline hover:bg-subtle sm:flex-row sm:items-center sm:gap-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">
                  {patient.firstName} {patient.lastName}
                </p>
                <p className="truncate text-[12.5px] text-muted">
                  {category.name}
                  {r.sentAt && ` · sent ${formatRelative(r.sentAt, now, s.settings)}`}
                  {r.repliedAt && ` · replied ${formatRelative(r.repliedAt, now, s.settings)}`}
                  {r.skipReason && ` · ${r.skipReason}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "text-[12.5px] font-medium",
                    r.state === "scheduled" ? "text-brand" : r.state === "opted_out" ? "text-danger" : r.state === "needs_human" ? "text-[#8a4b04]" : "text-ink-2",
                  )}
                >
                  {RECIPIENT_LABEL[r.state]}
                </span>
                <span className="text-faint" aria-hidden>
                  ·
                </span>
                <span className="text-[12px] text-muted">Case: {STATUS_LABEL[c.status]}</span>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ActivityList({ s, camp }: { s: DemoState; camp: Campaign }) {
  return (
    <ol className="divide-y divide-line">
      {camp.activity
        .slice()
        .reverse()
        .map((a, i) => (
          <li key={i} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[13px] sm:px-5">
            <span className="tnum text-[12px] text-muted">{formatDateTime(a.at, s.settings)}</span>
            <span className="text-ink">{a.label}</span>
          </li>
        ))}
    </ol>
  );
}
