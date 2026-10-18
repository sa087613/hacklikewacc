"use client";

import { ArrowRight, Check, Clock, Flag, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/ui/pill";
import { api, post, TEAM_NAMES, timeAgo, type Pending, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";
import { cn } from "@/lib/utils";

type Insight = { id: string; type: string; team_ids: TeamId[]; title: string; description: string; created_at: string };
type Home = {
  rampup_day: number | null;
  rampup_days: number;
  pending: (Pending & { question: string; answered: boolean })[];
  insights: Insight[];
  impact: { entries: number; people_helped: number; teams_reached: number };
};
type RampItem = { id: string; day: number; kind: "topic" | "person" | "gap"; title: string; done: boolean; detail: { why?: string; question?: string } };
type Path = { day: number; days: number; items: RampItem[]; progress: { done: number; total: number } };

const SUGGESTIONS = [
  "How does overtime affect benefits eligibility?",
  "When is unused PTO paid out after an employee leaves?",
  "Who owns retro pay corrections?",
];

/** "Overtime calculator" → "overtime calculator", but "PTO accrual" stays. */
const midSentence = (t: string) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const { user, error, version } = useDemoUser();
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [q, setQ] = useState("");

  const load = useCallback(() => {
    if (!user) return;
    api<Home>("/home").then(setHome).catch(() => setHome(null));
    api<Path>(`/rampup/${user.id}`).then(setPath).catch(() => setPath(null));
  }, [user]);
  useEffect(load, [load, version]);

  const ask = (question: string) => question.trim() && router.push(`/ask?q=${encodeURIComponent(question.trim())}`);
  const toggle = (id: string) => post(`/rampup/items/${id}/toggle`).then(load);

  const next = path ? [...path.items.filter((i) => !i.done), ...path.items.filter((i) => i.done)].slice(0, 4) : [];
  const pct = path?.progress.total ? Math.round((path.progress.done / path.progress.total) * 100) : 0;
  const waiting = (home?.pending ?? []).filter((p) => !p.answered);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title" suppressHydrationWarning>
          {greeting()}
          {user ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-navy-600">
          {error
            ? "Can't reach the Heirloom API. Start it with ./scripts/dev.sh"
            : user
              ? `${TEAM_NAMES[user.team_id]} · ${home?.rampup_day ? `Day ${home.rampup_day} of ${home.rampup_days} of your ramp-up` : user.title}`
              : "Loading…"}
        </p>
      </div>

      <section className="rounded-card bg-navy-950 p-7 text-white nav:p-10" aria-labelledby="hero-title">
        <h2 id="hero-title" className="font-serif text-[30px] font-medium leading-tight">
          What do you need to know?
        </h2>
        <form
          className="mt-5 flex flex-col gap-3 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask about any team's processes, rules, or people"
            aria-label="Question"
            className="min-h-tap flex-1 rounded-btn bg-card px-4 text-[15px] text-navy-900 placeholder:text-navy-600"
          />
          <Button type="submit" className="px-7">
            Ask
          </Button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="min-h-tap rounded-full border border-white/25 px-4 text-sm text-white/90 hover:bg-white/10"
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle>Your first two weeks</CardTitle>
            {path && (
              <span className="text-sm text-navy-600">
                {path.progress.done} of {path.progress.total} done
              </span>
            )}
          </div>
          <div className="mt-4 h-2 rounded-full bg-pill-mute" role="progressbar" aria-label="Ramp-up progress" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-red-600" style={{ width: `${pct}%` }} />
          </div>
          <ul className="mt-4 divide-y divide-line">
            {next.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-2">
                <button
                  type="button"
                  onClick={() => toggle(i.id)}
                  aria-pressed={i.done}
                  aria-label={`${i.done ? "Mark not done" : "Mark done"}: ${i.title}`}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-btn",
                  )}
                >
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-md border-2", i.done ? "border-red-600 bg-red-600 text-white" : "border-line")}>
                    {i.done && <Check className="h-4 w-4" aria-hidden />}
                  </span>
                </button>
                <span className={cn("flex-1", i.done && "text-navy-600 line-through")}>
                  {i.kind === "person" ? `Meet ${i.title}` : i.kind === "gap" ? `Known gap: ${i.title}` : `Learn ${midSentence(i.title)}`}
                </span>
                <span className="text-sm text-navy-600">Day {i.day}</span>
              </li>
            ))}
          </ul>
          <Link href="/rampup" className="mt-3 inline-flex min-h-tap items-center gap-1.5 font-semibold text-red-600 hover:text-red-700">
            See the full plan <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </Card>

        <Card>
          <CardTitle>Waiting on answers</CardTitle>
          <ul className="mt-4 space-y-4">
            {waiting.map((p) => (
              <li key={p.inbox_item_id + p.question} className="space-y-1.5">
                <Link href={`/ask?q=${encodeURIComponent(p.question)}`} className="font-medium hover:underline">
                  {p.question}
                </Link>
                <div>
                  <Pill tone="info">
                    <Clock className="h-3.5 w-3.5" aria-hidden />
                    {p.status === "escalated" ? `Escalated to ${p.escalated_to}` : `Asked ${p.person}`} · {timeAgo(p.asked_at)}
                  </Pill>
                </div>
              </li>
            ))}
            {home && waiting.length === 0 && <li className="text-navy-600">Nothing pending. Questions nobody has written down yet show up here.</li>}
          </ul>
          <h3 className="mt-6 text-[15px] font-semibold">From the latest standup</h3>
          <ul className="mt-3 space-y-3">
            {home?.insights.map((i) => (
              <li key={i.id} className="flex gap-2.5">
                <Flag className="mt-1 h-4 w-4 shrink-0 text-red-600" aria-hidden />
                <Link href="/insights" className="hover:underline">
                  <span className="font-medium capitalize">{i.type}:</span> {i.title || i.description}
                </Link>
              </li>
            ))}
            {home && home.insights.length === 0 && <li className="text-navy-600">No new insights since the last standup.</li>}
          </ul>
        </Card>
      </div>

      {home && home.impact.entries > 0 && home.impact.people_helped > 0 && (
        <Pill tone="ok" className="px-4 py-2 text-sm">
          <Sparkles className="h-4 w-4" aria-hidden />
          Your answers have helped {home.impact.people_helped} {home.impact.people_helped === 1 ? "person" : "people"} across{" "}
          {home.impact.teams_reached} {home.impact.teams_reached === 1 ? "team" : "teams"}
        </Pill>
      )}
    </div>
  );
}
