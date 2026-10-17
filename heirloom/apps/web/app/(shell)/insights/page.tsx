"use client";

import { Flag, Play, Recycle, Split, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { SourceChip } from "@/components/source-chip";
import { SourcePanel, type SourceRef } from "@/components/source-panel";
import { WithheldNotice } from "@/components/status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { api, KEEPER_NAMES, post, TEAM_NAMES, timeAgo, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Evidence = { team: TeamId; source_id: string; quote: string; title: string; start: number; end: number };
type Insight = {
  id: string;
  type: "overlap" | "reuse" | "conflict";
  team_ids: TeamId[];
  title: string;
  description: string;
  confidence: number;
  status: "new" | "useful" | "not_relevant";
  created_at: string;
  evidence: Evidence[];
  suggested_contacts: { person_id: string; name: string }[];
};
type StandupResult = { insights: Insight[]; stats: { proposed: number; low_confidence: number; unverified: number; suppressed: number; new: number } };
type Concern = { text: string; citations: { source_id: string; quote: string; title: string; start: number; end: number }[] };
type TeamImpact = {
  team: TeamId;
  team_name: string;
  no_impact: boolean;
  summary: string;
  concerns: Concern[];
  affected_areas: string[];
  contact: { name: string; title: string } | null;
  withheld: { team: TeamId; item: string; contact: string | null }[];
};
type ImpactResult = { id: string; change_description: string; from_team: TeamId; results: TeamImpact[] };

const TYPE = {
  overlap: { label: "Overlap", icon: Users },
  reuse: { label: "Reuse", icon: Recycle },
  conflict: { label: "Conflict", icon: Split },
};

function InsightCard({ ins, onOpen, onChange }: { ins: Insight; onOpen: (s: SourceRef) => void; onChange: () => void }) {
  const [threaded, setThreaded] = useState(false);
  const T = TYPE[ins.type];
  const level = ins.confidence >= 0.85 ? "High" : "Medium";
  return (
    <article className="rounded-card border bg-surface">
      <header className="flex flex-wrap items-center gap-2 border-b px-5 py-3 text-sm">
        <Flag className="h-4 w-4 text-adp-red" aria-hidden />
        <span className="font-semibold">{T.label}</span>
        <span className="text-muted">·</span>
        <span>{ins.team_ids.map((t) => TEAM_NAMES[t]).join(" ↔ ")}</span>
        <span className="text-muted">·</span>
        <span className="text-muted">
          {level} confidence ({Math.round(ins.confidence * 100)}%)
        </span>
        {ins.status !== "new" && (
          <Badge status={ins.status === "useful" ? "good" : "neutral"} className="ml-auto">
            {ins.status === "useful" ? "Marked useful" : "Not relevant"}
          </Badge>
        )}
      </header>
      <div className="space-y-3 px-5 py-4 text-sm">
        <p className="font-medium">{ins.title}</p>
        <p>{ins.description}</p>
        <ul className="space-y-2">
          {ins.evidence.map((e, i) => (
            <li key={i} className="flex items-start gap-2">
              <AgentAvatar team={e.team} className="h-6 w-6 text-[11px]" />
              <span className="flex-1">
                <span className="font-medium">{TEAM_NAMES[e.team]}:</span> &ldquo;{e.quote}&rdquo;
              </span>
              <SourceChip n={i + 1} title={e.title} onClick={() => onOpen({ source_id: e.source_id, start: e.start, end: e.end, title: e.title })} />
            </li>
          ))}
        </ul>
        {ins.suggested_contacts.length > 0 && (
          <p className="text-muted">Suggested: connect {ins.suggested_contacts.map((c) => c.name).join(" and ")}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={ins.status === "useful"} onClick={() => post(`/insights/${ins.id}/feedback`, { status: "useful" }).then(onChange)}>
            Useful
          </Button>
          <Button size="sm" variant="secondary" disabled={ins.status === "not_relevant"} onClick={() => post(`/insights/${ins.id}/feedback`, { status: "not_relevant" }).then(onChange)}>
            Not relevant
          </Button>
          <Button size="sm" variant="ghost" disabled={threaded} onClick={() => post(`/insights/${ins.id}/thread`).then(() => setThreaded(true))}>
            {threaded ? "Thread started · contacts notified" : "Start a thread"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function ImpactCard({ r, onOpen }: { r: TeamImpact; onOpen: (s: SourceRef) => void }) {
  // Number sources by first appearance across this card's concerns.
  const numbers = new Map<string, number>();
  for (const c of r.concerns) for (const ct of c.citations) if (!numbers.has(ct.source_id)) numbers.set(ct.source_id, numbers.size + 1);
  return (
    <article className={`rounded-card border ${r.no_impact ? "bg-surface-muted" : "bg-surface"}`}>
      <header className="flex items-center gap-3 border-b px-5 py-3">
        <AgentAvatar team={r.team} />
        <span className="font-semibold">{KEEPER_NAMES[r.team]}</span>
        <Badge status={r.no_impact ? "neutral" : "warn"} className="ml-auto">
          {r.no_impact ? "No impact found" : `${r.concerns.length} concern${r.concerns.length === 1 ? "" : "s"}`}
        </Badge>
      </header>
      <div className="space-y-3 px-5 py-4 text-sm">
        <p>{r.summary}</p>
        {r.concerns.length > 0 && (
          <ul className="space-y-2">
            {r.concerns.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-status-warn" />
                <span className="flex-1">
                  {c.text}
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {c.citations.map((ct, j) => (
                      <SourceChip key={j} n={numbers.get(ct.source_id)!} title={ct.title} onClick={() => onOpen({ source_id: ct.source_id, start: ct.start, end: ct.end, title: ct.title })} />
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {r.affected_areas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted">Affected:</span>
            {r.affected_areas.map((a) => (
              <Badge key={a} status="neutral">
                {a}
              </Badge>
            ))}
          </div>
        )}
        {r.contact && (
          <p className="text-xs text-muted">
            Suggested contact: <span className="text-adp-navy">{r.contact.name}</span> ({r.contact.title})
          </p>
        )}
        {r.withheld.map((w, i) => (
          <WithheldNotice key={i} item={w.item} team={w.team} contact={w.contact} />
        ))}
      </div>
    </article>
  );
}

export default function InsightsPage() {
  const { user, config, version, refreshBadges } = useDemoUser();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<StandupResult["stats"] | null>(null);
  const [change, setChange] = useState("");
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [source, setSource] = useState<SourceRef | null>(null);

  const load = useCallback(() => {
    api<Insight[]>("/insights").then(setInsights).catch(() => {});
    refreshBadges();
  }, [refreshBadges]);
  useEffect(load, [load, version]);

  const run = async () => {
    setRunning(true);
    try {
      const res = await post<StandupResult>("/standup/run");
      setStats(res.stats);
      load();
    } finally {
      setRunning(false);
    }
  };
  const check = async () => {
    if (!change.trim()) return;
    setChecking(true);
    try {
      setImpact(await post<ImpactResult>("/impact-check", { change_description: change }));
    } finally {
      setChecking(false);
    }
  };

  const latest = insights.length ? insights[0].created_at : null;
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Insights</h1>
            <p className="text-sm text-muted">
              Daily agent standups compare what each team is working on and flag overlaps, reuse, and conflicts. Only high-confidence insights are shown, each with
              evidence from both sides.
            </p>
          </div>
          {config?.demo_mode !== false && (
            <Button onClick={run} disabled={running}>
              <Play className="h-4 w-4" /> {running ? "Running standup…" : "Run standup now"}
            </Button>
          )}
        </div>
        <h2 className="text-lg font-semibold">
          From today&rsquo;s agent standup {latest && <span className="text-sm font-normal text-muted">· {timeAgo(latest)}</span>}
        </h2>
        {stats && (
          <p className="text-xs text-muted" role="status">
            Standup: {stats.proposed} proposed · {stats.new} new · {stats.low_confidence} below the confidence threshold
            {stats.unverified ? ` · ${stats.unverified} without verifiable evidence` : ""}
            {stats.suppressed ? ` · ${stats.suppressed} previously marked not relevant` : ""} (hidden)
          </p>
        )}
        {insights.map((i) => (
          <InsightCard key={i.id} ins={i} onOpen={setSource} onChange={load} />
        ))}
        {insights.length === 0 && (
          <Card className="text-sm text-muted">No insights yet. Standups run daily; use &ldquo;Run standup now&rdquo; to run one.</Card>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Impact check</h2>
        <Card className="space-y-3">
          <CardTitle className="text-base">Describe a proposed change</CardTitle>
          <textarea
            value={change}
            onChange={(e) => setChange(e.target.value)}
            rows={3}
            aria-label="Describe a proposed change"
            placeholder="Round overtime to the nearest 15 minutes instead of 6."
            className="w-full rounded-[6px] border px-3 py-2 text-sm"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={check} disabled={checking || !change.trim()}>
              {checking ? "Asking every team's Keeper…" : "Run impact check"}
            </Button>
            {!change && (
              <button className="text-xs text-muted underline-offset-2 hover:underline" onClick={() => setChange("Round overtime to the nearest 15 minutes instead of 6.")}>
                Use example
              </button>
            )}
            {user && <span className="text-xs text-muted">From {TEAM_NAMES[user.team_id]}. Every other team&rsquo;s Keeper assesses it.</span>}
          </div>
        </Card>
        {impact && (
          <div className="grid gap-4 md:grid-cols-2">
            {impact.results.map((r) => (
              <ImpactCard key={r.team} r={r} onOpen={setSource} />
            ))}
          </div>
        )}
      </section>
      <SourcePanel target={source} onClose={() => setSource(null)} />
    </div>
  );
}
