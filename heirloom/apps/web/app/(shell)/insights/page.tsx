"use client";

import { Play, Recycle, Split, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { SourceChip } from "@/components/source-chip";
import { SourcePanel, type SourceRef } from "@/components/source-panel";
import { WithheldNotice } from "@/components/status";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { api, KEEPER_NAMES, post, TEAM_NAMES, type TeamId } from "@/lib/api";
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
type StandupResult = { stats: { proposed: number; low_confidence: number; unverified: number; suppressed: number; new: number } };
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
type ImpactResult = { results: TeamImpact[] };

const TYPE = {
  overlap: { label: "Overlap", icon: Users, lead: "Two teams are building the same thing" },
  reuse: { label: "Reuse", icon: Recycle, lead: "One team already has what another plans to build" },
  conflict: { label: "Conflict", icon: Split, lead: "Two teams' documented rules disagree" },
};

const ORDER = { overlap: 0, reuse: 1, conflict: 2 };

function InsightCard({ ins, onOpen, onChange }: { ins: Insight; onOpen: (s: SourceRef) => void; onChange: () => void }) {
  const [threaded, setThreaded] = useState(false);
  const T = TYPE[ins.type];
  const high = ins.confidence >= 0.85;
  const sides = ins.team_ids.map((team) => ({ team, evidence: ins.evidence.filter((e) => e.team === team) }));
  return (
    <article aria-label={`${T.label}: ${ins.title || T.lead}`}>
      <Card className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone="mute">
            <T.icon className="h-3.5 w-3.5" aria-hidden /> {T.label}
          </Pill>
          <Pill tone={high ? "ok" : "info"}>{high ? "High confidence" : "Medium confidence"}</Pill>
          {ins.status !== "new" && <Pill tone="mute">{ins.status === "useful" ? "Marked useful" : "Marked not relevant"}</Pill>}
        </div>
        <div>
          <h3 className="font-serif text-[24px] font-medium leading-snug">{ins.title || T.lead}</h3>
          <p className="mt-1 text-navy-600">{ins.description}</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {sides.map(({ team, evidence }) => (
            <div key={team} className="space-y-3 rounded-[16px] bg-page p-5">
              <div className="flex items-center gap-3">
                <Avatar team={team} />
                <span className="font-semibold">{TEAM_NAMES[team]}</span>
              </div>
              {evidence.map((e, i) => (
                <div key={i} className="space-y-2">
                  <p className="font-serif text-[17px] leading-relaxed">&ldquo;{e.quote}&rdquo;</p>
                  <SourceChip
                    n={ins.evidence.indexOf(e) + 1}
                    title={e.title}
                    onClick={() => onOpen({ source_id: e.source_id, start: e.start, end: e.end, title: e.title })}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
        {ins.suggested_contacts.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold">Connect</span>
            {ins.suggested_contacts.map((c) => (
              <span key={c.person_id} className="flex items-center gap-2">
                <Avatar name={c.name} />
                {c.name}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={ins.status === "useful"}
            onClick={() => post(`/insights/${ins.id}/feedback`, { status: "useful" }).then(onChange)}
          >
            Useful
          </Button>
          <Button
            variant="secondary"
            disabled={ins.status === "not_relevant"}
            onClick={() => post(`/insights/${ins.id}/feedback`, { status: "not_relevant" }).then(onChange)}
          >
            Not relevant
          </Button>
          <Button variant="quiet" disabled={threaded} onClick={() => post(`/insights/${ins.id}/thread`).then(() => setThreaded(true))}>
            {threaded ? "Thread started, contacts notified" : "Start a thread"}
          </Button>
        </div>
      </Card>
    </article>
  );
}

function ImpactCard({ r, onOpen }: { r: TeamImpact; onOpen: (s: SourceRef) => void }) {
  const numbers = new Map<string, number>();
  for (const c of r.concerns) for (const ct of c.citations) if (!numbers.has(ct.source_id)) numbers.set(ct.source_id, numbers.size + 1);
  return (
    <article aria-label={`Impact for ${KEEPER_NAMES[r.team]}`}>
      <Card className={r.no_impact ? "h-full space-y-4 bg-page" : "h-full space-y-4"}>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar team={r.team} size="md" />
          <span className="flex-1 font-semibold">{KEEPER_NAMES[r.team]}</span>
          <Pill tone={r.no_impact ? "mute" : "warn"}>
            {r.no_impact ? "No impact found" : `${r.concerns.length} concern${r.concerns.length === 1 ? "" : "s"}`}
          </Pill>
        </div>
        <p>{r.summary}</p>
        {r.concerns.length > 0 && (
          <ul className="space-y-3">
            {r.concerns.map((c, i) => (
              <li key={i} className="space-y-2 border-t border-line pt-3">
                <p>{c.text}</p>
                <div className="flex flex-wrap gap-2">
                  {c.citations.map((ct, j) => (
                    <SourceChip
                      key={j}
                      n={numbers.get(ct.source_id)!}
                      title={ct.title}
                      onClick={() => onOpen({ source_id: ct.source_id, start: ct.start, end: ct.end, title: ct.title })}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {r.affected_areas.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Affected</span>
            {r.affected_areas.map((a) => (
              <Pill key={a} tone="mute">
                {a}
              </Pill>
            ))}
          </div>
        )}
        {r.contact && (
          <div className="flex items-center gap-3 rounded-[14px] bg-page px-4 py-3">
            <Avatar name={r.contact.name} />
            <span>
              Tell <span className="font-semibold">{r.contact.name}</span>, {r.contact.title}
            </span>
          </div>
        )}
        {r.withheld.map((w, i) => (
          <WithheldNotice key={i} item={w.item} team={w.team} contact={w.contact} />
        ))}
      </Card>
    </article>
  );
}

export default function InsightsPage() {
  const { user, config, version, refreshBadges } = useDemoUser();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<StandupResult["stats"] | null>(null);
  const [change, setChange] = useState("Round overtime to the nearest 15 minutes instead of 6.");
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [source, setSource] = useState<SourceRef | null>(null);

  const load = useCallback(() => {
    api<Insight[]>("/insights")
      .then(setInsights)
      .catch(() => {});
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="mt-1 text-navy-600">
            Keepers compare notes every morning and flag overlaps, reuse, and conflicts. Only high-confidence findings make it here.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-navy-600">Last standup 9:00 AM</span>
          {config?.demo_mode !== false && (
            <Button onClick={run} disabled={running}>
              <Play className="h-4 w-4" aria-hidden /> {running ? "Running standup…" : "Run standup now"}
            </Button>
          )}
        </div>
      </div>

      <section className="space-y-6" aria-label="From the agent standup">
        {stats && (
          <p className="text-navy-600" role="status">
            {stats.new} new · {stats.low_confidence} below the confidence threshold
            {stats.unverified ? ` · ${stats.unverified} without verifiable evidence` : ""}
            {stats.suppressed ? ` · ${stats.suppressed} you marked not relevant` : ""} (hidden)
          </p>
        )}
        {[...insights]
          .sort((a, b) => ORDER[a.type] - ORDER[b.type])
          .map((i) => (
            <InsightCard key={i.id} ins={i} onOpen={setSource} onChange={load} />
          ))}
        {insights.length === 0 && <Card className="text-navy-600">No insights yet. Run a standup to see what the Keepers notice.</Card>}
      </section>

      <section className="space-y-6" aria-labelledby="impact-title">
        <Card className="space-y-4">
          <CardTitle id="impact-title">Impact check</CardTitle>
          <p className="text-navy-600">
            Describe a change. {user ? `Every team other than ${TEAM_NAMES[user.team_id]}` : "Every other team"} gets asked what it would
            break.
          </p>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <input
              value={change}
              onChange={(e) => setChange(e.target.value)}
              aria-label="Describe a proposed change"
              className="min-h-tap flex-1 rounded-btn border border-line px-4"
            />
            <Button type="submit" disabled={checking || !change.trim()}>
              {checking ? "Asking every Keeper…" : "Run impact check"}
            </Button>
          </form>
        </Card>
        {impact && (
          <div className="grid gap-6 md:grid-cols-2">
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
