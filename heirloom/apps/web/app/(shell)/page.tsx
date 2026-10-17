"use client";

import { Flag, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { PendingBadge } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { api, KEEPER_NAMES, TEAM_NAMES, type Pending, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Insight = { id: string; type: string; team_ids: TeamId[]; title: string; description: string; confidence: number };
type Home = {
  rampup_day: number | null;
  rampup_days: number;
  pending: (Pending & { question: string; answered: boolean })[];
  insights: Insight[];
  insight_count: number;
  impact: { entries: number; people_helped: number; teams_reached: number };
  inbox_count: number;
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const { user, error, version } = useDemoUser();
  const router = useRouter();
  const [home, setHome] = useState<Home | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (user) api<Home>("/home").then(setHome).catch(() => setHome(null));
  }, [user, version]);

  const firstName = user?.name.split(" ")[0];
  const ask = (question: string) => question.trim() && router.push(`/ask?q=${encodeURIComponent(question.trim())}`);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-2xl font-semibold" suppressHydrationWarning>
          {greeting()}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1 text-muted">
          {error
            ? "Can't reach the Heirloom API. Start it with: uvicorn main:app --reload --port 8000"
            : user
              ? `You're on: ${TEAM_NAMES[user.team_id]}` +
                (home?.rampup_day ? ` · Ramp-up day ${home.rampup_day} of ${home.rampup_days}` : ` · ${user.title}`)
              : "Loading…"}
        </p>
      </Card>

      {user && (
        <Card>
          <div className="flex items-center gap-3">
            <AgentAvatar team={user.team_id} />
            <CardTitle>Ask {KEEPER_NAMES[user.team_id]}</CardTitle>
          </div>
          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask(q);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask anything about your team or other teams…"
              aria-label="Question"
              className="h-9 flex-1 rounded-[6px] border bg-surface px-3 text-sm placeholder:text-muted"
            />
            <Button type="submit">Ask</Button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Try:{" "}
            <button className="underline-offset-2 hover:underline" onClick={() => ask("How does overtime affect benefits eligibility?")}>
              &ldquo;How does overtime affect benefits eligibility?&rdquo;
            </button>
          </p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardTitle className="text-base">Your pending questions</CardTitle>
          <ul className="mt-3 space-y-3">
            {home?.pending.map((p) => (
              <li key={p.inbox_item_id + p.question} className="space-y-1 text-sm">
                <Link href={`/ask?q=${encodeURIComponent(p.question)}`} className="hover:underline">
                  {p.question}
                </Link>
                <div>
                  <PendingBadge pending={p.answered ? { ...p, status: "answered" } : p} />
                </div>
              </li>
            ))}
            {home && home.pending.length === 0 && <li className="text-sm text-muted">None. Questions without a documented answer show up here.</li>}
          </ul>
        </Card>
        <Card>
          <CardTitle className="text-base">
            New insights{home?.insight_count ? ` (${home.insight_count})` : ""}
          </CardTitle>
          <ul className="mt-3 space-y-3">
            {home?.insights.map((i) => (
              <li key={i.id} className="flex gap-2 text-sm">
                <Flag className="mt-0.5 h-4 w-4 shrink-0 text-adp-red" aria-hidden />
                <Link href="/insights" className="hover:underline">
                  <span className="font-medium capitalize">{i.type}:</span> {i.title || i.description}
                </Link>
              </li>
            ))}
            {home && home.insights.length === 0 && (
              <li className="text-sm text-muted">No new insights. Agent standups surface overlaps and conflicts here.</li>
            )}
          </ul>
        </Card>
      </div>

      {home && home.impact.entries > 0 && (
        <Card className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-status-good" aria-hidden />
          <p className="text-sm">
            Your answers have helped <strong>{home.impact.people_helped}</strong>{" "}
            {home.impact.people_helped === 1 ? "person" : "people"} across <strong>{home.impact.teams_reached}</strong>{" "}
            {home.impact.teams_reached === 1 ? "team" : "teams"}.
          </p>
        </Card>
      )}
    </div>
  );
}
