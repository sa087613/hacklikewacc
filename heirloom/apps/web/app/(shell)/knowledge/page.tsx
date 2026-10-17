"use client";

import { AlertTriangle, CalendarPlus, LogOut, ShieldAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusFactorMap, type Topic } from "@/components/bus-factor-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, isLead, post, shortDate, TEAM_NAMES, TEAMS, type EntryView, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type MapData = { topics: Topic[]; stats: { red: number; amber: number; green: number; expiring: number } };
type Detail = Topic & {
  entries: EntryView[];
  sources: { id: string; title: string; type: string; share_level: string }[];
  open_questions: { id: string; question: string; status: string }[];
};

function TopicPanel({ topicId, onClose, onChanged }: { topicId: string; onClose: () => void; onChanged: () => void }) {
  const { user, people } = useDemoUser();
  const router = useRouter();
  const [d, setD] = useState<Detail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setD(null);
    setMsg(null);
    setConsent(false);
    api<Detail>(`/knowledge/topics/${topicId}`).then(setD);
  }, [topicId]);

  if (!d) return null;
  const sole = d.bus_factor === 1 ? d.knowers[0] : null;
  const soleTeam = sole && people.find((p) => p.id === sole.person_id)?.team_id;
  const canStartExit = !!sole?.departing && user?.team_id === soleTeam && isLead(user);

  const startExit = async () => {
    setStarting(true);
    setError(null);
    try {
      const iv = await post<{ id: string }>("/exit-interviews", { person_id: sole!.person_id, consent });
      router.push(`/exit-interview/${iv.id}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col border-l bg-surface shadow-xl">
      <div className="flex items-start justify-between border-b px-5 py-4">
        <div>
          <p className="text-xs text-muted">
            {TEAM_NAMES[d.team_id]}
            {d.co_owner_team_ids.length > 0 && ` · co-owned with ${d.co_owner_team_ids.map((t) => TEAM_NAMES[t]).join(", ")}`}
          </p>
          <h2 className="text-lg font-semibold">{d.name}</h2>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-[6px] p-1 hover:bg-adp-navy-50">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
        <div className="flex flex-wrap gap-2">
          <Badge status={d.status === "red" ? "critical" : d.status === "amber" ? "warn" : "good"}>
            {d.bus_factor} {d.bus_factor === 1 ? "person knows" : "people know"} this
          </Badge>
          <Badge status={d.documented ? "info" : "neutral"}>{d.documented ? "Documented" : "Undocumented"}</Badge>
          {d.last_verified && <Badge status="neutral">Last verified {shortDate(d.last_verified)}</Badge>}
        </div>

        {sole && d.status === "red" && (
          <div className="space-y-2 rounded-[6px] border border-status-critical/40 bg-status-critical/[.05] p-3">
            <p className="flex items-center gap-2 font-medium text-status-critical">
              <ShieldAlert className="h-4 w-4" /> Organizational risk: only {sole.name} knows this
              {sole.departing && " and they are leaving"}.
            </p>
            {msg ? (
              <p className="text-status-good">{msg}</p>
            ) : (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => post<{ scheduled_with: string }>(`/knowledge/topics/${d.id}/capture`).then((r) => setMsg(`Capture session requested with ${r.scheduled_with}.`))}
              >
                <CalendarPlus className="h-4 w-4" /> Schedule a 10-minute capture session with {sole.name.split(" ")[0]}
              </Button>
            )}
          </div>
        )}

        {canStartExit && (
          <div className="space-y-2 rounded-[6px] border p-3">
            <p className="flex items-center gap-2 font-medium">
              <LogOut className="h-4 w-4" /> {sole!.name} has given notice
            </p>
            <p className="text-muted">
              An exit interview asks targeted questions about every topic where {sole!.name.split(" ")[0]} is the only source. It&rsquo;s voluntary, and they
              review everything before it&rsquo;s saved.
            </p>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
              <span>{sole!.name} has agreed to an exit interview.</span>
            </label>
            {error && <p className="text-status-critical">{error}</p>}
            <Button size="sm" disabled={!consent || starting} onClick={startExit}>
              Start exit interview
            </Button>
          </div>
        )}

        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">People who know it</h3>
          <ul className="space-y-1">
            {d.knowers.map((k) => (
              <li key={k.person_id}>
                {k.name} <span className="text-muted">· {k.title} · {k.roles.join(", ")}</span>
                {k.departing && <Badge status="warn" className="ml-2">Departing</Badge>}
              </li>
            ))}
            {d.knowers.length === 0 && <li className="text-muted">Nobody yet.</li>}
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Knowledge entries</h3>
          <ul className="space-y-2">
            {d.entries.map((e) => (
              <li key={e.id} className="rounded-[6px] border p-2.5">
                <p className="font-medium">{e.question}</p>
                <p className="text-muted">{e.summary}</p>
                <p className="mt-1 text-xs text-muted">
                  {e.status} · verified by {e.verified_by} {shortDate(e.verified_at)}
                  {e.expires_at && ` · expires ${shortDate(e.expires_at)}`}
                </p>
              </li>
            ))}
            {d.entries.length === 0 && <li className="text-muted">No approved entries.</li>}
          </ul>
        </section>
        <section>
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Sources</h3>
          <ul className="space-y-1">
            {d.sources.map((s) => (
              <li key={s.id}>
                {s.title} <span className="text-xs text-muted">· {s.type.replace("_", " ")}</span>
              </li>
            ))}
          </ul>
        </section>
        {d.open_questions.length > 0 && (
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Open questions</h3>
            <ul className="space-y-1">
              {d.open_questions.map((q) => (
                <li key={q.id}>
                  {q.question} <span className="text-xs text-muted">· {q.status}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}

export default function KnowledgePage() {
  const { user, version } = useDemoUser();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamId | "all">("all");
  const [status, setStatus] = useState<"all" | "red" | "amber" | "green">("all");
  const [expiring, setExpiring] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    api<MapData>("/knowledge/map")
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e.message);
      });
  }, []);
  useEffect(() => {
    if (user && isLead(user)) load();
  }, [load, version, user]);

  const topics = useMemo(
    () =>
      (data?.topics ?? []).filter(
        (t) => (team === "all" || t.team_id === team) && (status === "all" || t.status === status) && (!expiring || t.expiring_soon),
      ),
    [data, team, status, expiring],
  );

  if (user && !isLead(user)) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <Card className="text-sm text-muted">
          The bus factor map is visible to team leads only. It shows organizational risk, never a judgment of a person.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Knowledge</h1>
        <p className="text-sm text-muted">Bus factor: how many people know each topic. This shows organizational risk, not individual performance. Visible to team leads only.</p>
      </div>
      {error && <Card className="text-sm text-status-critical">{error}</Card>}
      {data && (
        <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3 text-sm">
          <span className="flex items-center gap-1.5 font-semibold text-status-critical">
            <AlertTriangle className="h-4 w-4" /> {data.stats.red} red topic{data.stats.red === 1 ? "" : "s"}
          </span>
          <span className="font-semibold text-status-warn">{data.stats.amber} amber</span>
          <span className="font-semibold text-status-good">{data.stats.green} green</span>
          <span className="text-muted">{data.stats.expiring} expiring this month</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <select value={team} onChange={(e) => setTeam(e.target.value as TeamId | "all")} aria-label="Team" className="h-8 rounded-[6px] border bg-surface px-2">
              <option value="all">All teams</option>
              {TEAMS.map((t) => (
                <option key={t} value={t}>
                  {TEAM_NAMES[t]}
                </option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status" className="h-8 rounded-[6px] border bg-surface px-2">
              <option value="all">All statuses</option>
              <option value="red">Red</option>
              <option value="amber">Amber</option>
              <option value="green">Green</option>
            </select>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={expiring} onChange={(e) => setExpiring(e.target.checked)} /> Expiring soon
            </label>
          </span>
        </Card>
      )}
      <p className="text-xs text-muted">
        <span className="font-semibold text-status-critical">Red</span>: 1 person, undocumented · <span className="font-semibold text-status-warn">Amber</span>: 1–2
        people or partly documented · <span className="font-semibold text-status-good">Green</span>: 3+ people, documented. Tile size: how often it&rsquo;s asked.
      </p>
      {data && <BusFactorMap topics={topics} selected={selected} onSelect={(t) => setSelected(t.id)} />}
      {selected && (
        <TopicPanel
          topicId={selected}
          onClose={() => {
            setSelected(null);
            load();
          }}
          onChanged={load}
        />
      )}
    </div>
  );
}
