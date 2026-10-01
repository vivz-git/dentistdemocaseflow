"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { formatMoney, formatRelative } from "@/lib/domain/format";
import { CASE_STATUSES, STATUS_LABEL } from "@/lib/domain/status";
import type { CaseStatus } from "@/lib/domain/types";
import { caseRows, nextAction, urgency } from "@/lib/selectors";
import { useDemoState, useNow } from "@/lib/store";
import { AutomationIndicator, StatusBadge } from "@/components/status";
import { ToneText } from "@/components/tone";
import { Button, Card, DemoTag, EmptyState, Input, PageHeader, Segmented } from "@/components/ui";

type Filter = "action" | "all" | CaseStatus;

export function CasesList() {
  const s = useDemoState();
  const now = useNow();
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("status") as Filter) || "action";
  const [filter, setFilterState] = useState<Filter>(initial);
  const [q, setQ] = useState("");

  const setFilter = (f: Filter) => {
    setFilterState(f);
    router.replace(f === "action" ? "/cases" : `/cases?status=${f}`, { scroll: false });
  };

  const all = useMemo(() => caseRows(s), [s]);
  const rows = useMemo(() => {
    return all
      .filter((r) => {
        if (q && !r.name.toLowerCase().includes(q.toLowerCase().trim())) return false;
        if (filter === "action") return urgency(s, r.c, now) <= 5;
        if (filter === "all") return true;
        return r.c.status === filter;
      })
      .sort((a, b) => urgency(s, a.c, now) - urgency(s, b.c, now) || (b.lastActivity > a.lastActivity ? 1 : -1));
  }, [all, q, filter, s, now]);

  const counts = Object.fromEntries(CASE_STATUSES.map((st) => [st, all.filter((r) => r.c.status === st).length])) as Record<CaseStatus, number>;
  const actionCount = all.filter((r) => urgency(s, r.c, now) <= 5).length;

  return (
    <>
      <PageHeader
        title="Cases"
        description="One follow-up case per unscheduled treatment plan. Sorted so the cases that need a person come first."
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:px-5 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <Segmented<Filter>
              label="Filter by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "action", label: "Needs action", count: actionCount },
                { value: "all", label: "All", count: all.length },
                ...CASE_STATUSES.map((st) => ({ value: st as Filter, label: STATUS_LABEL[st], count: counts[st] })),
              ]}
            />
          </div>
          <label className="relative block xl:w-60">
            <span className="sr-only">Search patients</span>
            <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient" className="pl-9" />
          </label>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title={filter === "action" ? "Nothing needs a person right now" : "No cases match"}
            action={q ? <Button onClick={() => setQ("")}>Clear search</Button> : undefined}
          >
            {filter === "action" ? "CaseFlow is handling every open case. New replies and handoffs appear here." : "Try another status or name."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full text-left text-[13px]">
                <thead className="text-[12px] text-muted">
                  <tr className="border-b border-line">
                    <th scope="col" className="py-2.5 pr-3 pl-5 font-medium">Patient</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Next step</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Automation</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">
                      Value <DemoTag />
                    </th>
                    <th scope="col" className="py-2.5 pr-5 pl-3 text-right font-medium">Last activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {rows.map((r) => {
                    const na = nextAction(s, r.c, now);
                    return (
                      <tr key={r.c.id} className="group relative hover:bg-subtle">
                        <td className="py-3 pr-3 pl-5">
                          <Link href={`/cases/${r.c.id}`} className="font-medium text-ink no-underline after:absolute after:inset-0 group-hover:underline">
                            {r.name}
                          </Link>
                          {r.c.unread && <span className="ml-2 inline-block size-2 rounded-full bg-[#d97706] align-middle" aria-label="Unread reply" />}
                          <p className="text-[12px] text-muted">{r.category}</p>
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={r.c.status} />
                        </td>
                        <td className="max-w-[320px] px-3 py-3">
                          <ToneText tone={na.tone} className="block truncate font-medium">
                            {na.label}
                          </ToneText>
                          {na.detail && <p className="truncate text-[12px] text-muted">{na.detail}</p>}
                        </td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          <AutomationIndicator state={r.c.automation.state} />
                        </td>
                        <td className="tnum px-3 py-3 text-right text-ink">{formatMoney(r.value, s.settings)}</td>
                        <td className="py-3 pr-5 pl-3 text-right text-ink-2">{formatRelative(r.lastActivity, now, s.settings)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((r) => {
                const na = nextAction(s, r.c, now);
                return (
                  <li key={r.c.id}>
                    <Link href={`/cases/${r.c.id}`} className="flex flex-col gap-1 px-4 py-3 no-underline hover:bg-subtle">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-medium text-ink">
                          {r.name}
                          {r.c.unread && <span className="ml-2 inline-block size-2 rounded-full bg-[#d97706] align-middle" aria-label="Unread reply" />}
                        </p>
                        <StatusBadge status={r.c.status} />
                      </div>
                      <p className="truncate text-[12.5px] text-muted">
                        {r.category} · {formatMoney(r.value, s.settings)}
                      </p>
                      <ToneText tone={na.tone} className="truncate text-[13px] font-medium">
                        {na.label}
                      </ToneText>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <p className="border-t border-line px-4 py-3 text-[12px] text-muted sm:px-5">
          Showing {rows.length} of {all.length} cases
        </p>
      </Card>
    </>
  );
}
