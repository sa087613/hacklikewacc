"use client";

import { AlertTriangle, CalendarPlus, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BusFactorMap, type Topic } from "@/components/bus-factor-map";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { Segmented } from "@/components/ui/segmented";
import { api, isLead, post, shortDate, TEAM_NAMES, type EntryView } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type MapData = { topics: Topic[]; stats: { red: number; amber: number; green: number; expiring: number } };
type Detail = Topic & {
  entries: EntryView[];
  sources: { id: string; title: string; type: string; share_level: string }[];
  open_questions: { id: string; question: string; status: string }[];
};
type Filter = "all" | "red" | "amber" | "green" | "expiring";

/** Start exit interview (consent required) + schedule capture: the two actions on an at-risk topic. */
function RiskActions({ topic, personId, personName, dark }: { topic: Topic; personId: string; personName: string; dark?: boolean }) {
  const router = useRouter();
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const first = personName.split(" ")[0];

  const start = async () => {
    setError(null);
    try {
      const iv = await post<{ id: string }>("/exit-interviews", { person_id: personId, consent });
      router.push(`/exit-interview/${iv.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="space-y-3">
      <label className="flex min-h-tap items-center gap-3">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="h-5 w-5 accent-red-600" />
        <span>{personName} has agreed to an exit interview.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!consent} onClick={start}>
          <LogOut className="h-4 w-4" aria-hidden /> Start exit interview
        </Button>
        <Button
          variant={dark ? "on-dark" : "secondary"}
          disabled={!!msg}
          onClick={() =>
            post<{ scheduled_with: string }>(`/knowledge/topics/${topic.id}/capture`)
              .then((r) => setMsg(`Capture session requested with ${r.scheduled_with}.`))
              .catch((e) => setError(e.message))
          }
        >
          <CalendarPlus className="h-4 w-4" aria-hidden /> Schedule 10-minute capture session
        </Button>
      </div>
      {msg && <p>{msg}</p>}
      {error && <p className={dark ? "text-pill-bad" : "text-pill-bad-fg"}>{error}</p>}
      <span className="sr-only">Actions for {first}</span>
    </div>
  );
}

function DetailPanel({ topicId }: { topicId: string }) {
  const [d, setD] = useState<Detail | null>(null);
  useEffect(() => {
    setD(null);
    api<Detail>(`/knowledge/topics/${topicId}`).then(setD);
  }, [topicId]);
  if (!d) return <div className="rounded-card bg-navy-950 p-7 text-white/80">Loading…</div>;
  const sole = d.bus_factor === 1 ? d.knowers[0] : null;
  return (
    <aside className="space-y-6 rounded-card bg-navy-950 p-7 text-white" aria-label={`${d.name} details`}>
      <div>
        <p className="text-sm text-white/70">
          {TEAM_NAMES[d.team_id]}
          {d.co_owner_team_ids.length > 0 && ` · shared with ${d.co_owner_team_ids.map((t) => TEAM_NAMES[t]).join(", ")}`}
        </p>
        <h2 className="font-serif text-[28px] font-medium leading-tight">{d.name}</h2>
      </div>
      <div className="flex items-end gap-3">
        <span className="font-serif text-[80px] font-medium leading-none">{d.bus_factor}</span>
        <span className="pb-3 text-white/80">{d.bus_factor === 1 ? "person knows this" : "people know this"}</span>
      </div>
      <ul className="space-y-3">
        {d.knowers.map((k) => (
          <li key={k.person_id} className="flex items-center gap-3">
            <Avatar name={k.name} size="md" />
            <span className="flex-1">
              <span className="block font-semibold">{k.name}</span>
              <span className="block text-sm text-white/70">{k.title}</span>
            </span>
            {k.departing && <Pill tone="bad">Leaving</Pill>}
          </li>
        ))}
        {d.knowers.length === 0 && <li className="text-white/70">Nobody yet.</li>}
      </ul>
      <p className="text-white/80">
        {d.last_verified ? `Last verified ${shortDate(d.last_verified)}` : "Never verified"} · {d.documented ? "documented" : "not written down"}
      </p>
      {sole && d.status !== "green" && <RiskActions topic={d} personId={sole.person_id} personName={sole.name} dark />}
      {d.entries.length > 0 && (
        <div className="space-y-2 border-t border-white/15 pt-4">
          <p className="font-semibold">Entries</p>
          {d.entries.map((e) => (
            <p key={e.id} className="text-sm text-white/80">
              {e.question} · {e.status}
            </p>
          ))}
        </div>
      )}
      {d.sources.length > 0 && (
        <div className="space-y-2 border-t border-white/15 pt-4">
          <p className="font-semibold">Sources</p>
          {d.sources.map((s) => (
            <p key={s.id} className="text-sm text-white/80">
              {s.title}
            </p>
          ))}
        </div>
      )}
    </aside>
  );
}

export default function KnowledgePage() {
  const { user, people, version } = useDemoUser();
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
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
    () => (data?.topics ?? []).filter((t) => (filter === "all" ? true : filter === "expiring" ? t.expiring_soon : t.status === filter)),
    [data, filter],
  );

  // Spotlight: someone who has given notice and is the only one who knows a red topic.
  const spotlight = useMemo(() => {
    for (const t of data?.topics ?? []) {
      const k = t.status === "red" && t.bus_factor === 1 ? t.knowers[0] : null;
      if (k?.departing) return { topic: t, person: k };
    }
    return null;
  }, [data]);

  useEffect(() => {
    if (!selected && data?.topics.length) setSelected((spotlight?.topic ?? data.topics.find((t) => t.status === "red") ?? data.topics[0]).id);
  }, [data, spotlight, selected]);

  if (user && !isLead(user)) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Knowledge</h1>
        <Card className="text-navy-600">The bus factor map is visible to team leads only. It shows organizational risk, never a judgment of a person.</Card>
      </div>
    );
  }

  const canAct = spotlight && people.find((p) => p.id === spotlight.person.person_id)?.team_id === user?.team_id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Knowledge</h1>
        <p className="mt-1 text-navy-600">How many people know each topic. This is organizational risk, not a judgment of anyone. Team leads only.</p>
      </div>
      {error && <Card className="text-pill-bad-fg">{error}</Card>}

      {spotlight && (
        <section className="space-y-4 rounded-card border border-pill-bad-fg/20 bg-pill-bad p-7" aria-labelledby="spotlight">
          <p id="spotlight" className="font-serif text-[26px] font-medium leading-snug text-pill-bad-fg">
            {spotlight.person.name} gave notice yesterday.
          </p>
          <p>
            {spotlight.person.name.split(" ")[0]} is the only person who knows <span className="font-semibold">{spotlight.topic.name.toLowerCase()}</span>.
          </p>
          {canAct ? (
            <RiskActions topic={spotlight.topic} personId={spotlight.person.person_id} personName={spotlight.person.name} />
          ) : (
            <p className="text-sm">Their team lead can start an exit interview.</p>
          )}
        </section>
      )}

      {data && (
        <Card className="flex flex-wrap items-center gap-x-8 gap-y-4 py-5">
          <span className="flex items-center gap-2 font-semibold text-pill-bad-fg">
            <AlertTriangle className="h-4 w-4" aria-hidden /> {data.stats.red} red
          </span>
          <span className="font-semibold text-pill-warn-fg">{data.stats.amber} amber</span>
          <span className="font-semibold text-pill-ok-fg">{data.stats.green} green</span>
          <span className="text-navy-600">{data.stats.expiring} expiring this month</span>
          <Segmented
            className="ml-auto"
            label="Filter topics"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "red", label: "Red" },
              { value: "amber", label: "Amber" },
              { value: "green", label: "Green" },
              { value: "expiring", label: "Expiring" },
            ]}
          />
        </Card>
      )}

      {data && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-3">
            <BusFactorMap topics={topics} selected={selected} onSelect={(t) => setSelected(t.id)} />
            <p className="text-sm text-navy-600">Red: one person and not written down. Amber: one or two people, or partly written down. Green: three or more people and written down. Taller tiles get asked more.</p>
          </div>
          {selected && <DetailPanel key={selected} topicId={selected} />}
        </div>
      )}
    </div>
  );
}
