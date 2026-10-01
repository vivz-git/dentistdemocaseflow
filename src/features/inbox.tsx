"use client";

import clsx from "clsx";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import { caseContext } from "@/lib/domain/engine";
import { formatRelative } from "@/lib/domain/format";
import { useDemoState, useNow } from "@/lib/store";
import { AutomationIndicator, StatusBadge } from "@/components/status";
import { ButtonLink, Card, EmptyState, PageHeader, Segmented } from "@/components/ui";
import { ConversationPanel } from "./conversation";

type Filter = "all" | "unread" | "human" | "staff";

export function Inbox() {
  const s = useDemoState();
  const now = useNow();
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("case");
  const [filter, setFilter] = useState<Filter>((params.get("filter") as Filter) || "all");

  const threads = useMemo(() => {
    return s.cases
      .map((c) => {
        const msgs = s.messages.filter((m) => m.caseId === c.id);
        return { c, last: msgs.at(-1) };
      })
      .filter((t) => t.last)
      .filter((t) => {
        if (filter === "unread") return t.c.unread;
        if (filter === "human") return t.c.status === "needs_human";
        if (filter === "staff") return t.c.automation.state === "staff";
        return true;
      })
      .sort((a, b) => (Number(b.c.unread) - Number(a.c.unread)) || (b.last!.at > a.last!.at ? 1 : -1));
  }, [s, filter]);

  const selected = s.cases.find((c) => c.id === selectedId);
  const select = (id: string) => router.replace(`/conversations?case=${id}${filter !== "all" ? `&filter=${filter}` : ""}`, { scroll: false });

  return (
    <>
      <PageHeader title="Conversations" description="Every simulated patient conversation. AI, staff and system messages are labelled." />
      <Card className="overflow-hidden lg:grid lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className={clsx("flex min-w-0 flex-col border-line lg:border-r", selected && "max-lg:hidden")}>
          <div className="border-b border-line px-3 py-2.5">
            <Segmented<Filter>
              label="Filter conversations"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "unread", label: "Unread", count: s.cases.filter((c) => c.unread).length },
                { value: "human", label: "Needs human", count: s.cases.filter((c) => c.status === "needs_human").length },
                { value: "staff", label: "Staff" },
              ]}
            />
          </div>
          {threads.length === 0 ? (
            <EmptyState title="No conversations here">Switch the filter to see other conversations.</EmptyState>
          ) : (
            <ul className="scroll-thin max-h-[calc(62dvh+190px)] divide-y divide-line overflow-y-auto">
              {threads.map(({ c, last }) => {
                const { patient } = caseContext(s, c);
                const active = c.id === selectedId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => select(c.id)}
                      aria-current={active ? "true" : undefined}
                      className={clsx("flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors duration-150", active ? "bg-brand-soft/60" : "hover:bg-subtle")}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className={clsx("truncate text-sm text-ink", c.unread ? "font-semibold" : "font-medium")}>
                          {patient.firstName} {patient.lastName}
                        </span>
                        <span className="tnum shrink-0 text-[11.5px] text-faint">{formatRelative(last!.at, now, s.settings)}</span>
                      </span>
                      <span className={clsx("line-clamp-1 text-[12.5px]", c.unread ? "text-ink" : "text-muted")}>
                        {last!.sender === "patient" ? "" : `${last!.sender === "ai" ? "AI" : last!.sender === "staff" ? "Staff" : "System"}: `}
                        {last!.body}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge status={c.status} />
                        {c.unread && <span className="size-2 rounded-full bg-[#d97706]" aria-label="Unread" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className={clsx("min-w-0", !selected && "max-lg:hidden")}>
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <button type="button" onClick={() => router.replace("/conversations", { scroll: false })} className="-ml-1 rounded-md p-1 text-muted hover:bg-rail lg:hidden" aria-label="Back to conversations">
                    <ArrowLeft size={18} />
                  </button>
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ink">
                      {caseContext(s, selected).patient.firstName} {caseContext(s, selected).patient.lastName}
                    </p>
                    <p className="truncate text-[12.5px] text-muted">{caseContext(s, selected).category.name}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="hidden sm:inline">
                    <AutomationIndicator state={selected.automation.state} />
                  </span>
                  <ButtonLink href={`/cases/${selected.id}`} size="sm">
                    Open case
                  </ButtonLink>
                </div>
              </div>
              <ConversationPanel s={s} c={selected} compactHeader />
            </>
          ) : (
            <div className="flex h-full min-h-80 items-center justify-center">
              <EmptyState title="Choose a conversation">
                Unread replies and handoffs are listed first. <Link href="/cases?status=needs_human">See the Needs Human queue</Link>.
              </EmptyState>
            </div>
          )}
        </div>
      </Card>
    </>
  );
}
