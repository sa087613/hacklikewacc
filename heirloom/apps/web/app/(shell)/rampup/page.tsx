"use client";

import { CircleHelp, MessageSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/pill";
import { Card } from "@/components/ui/card";
import { api, post, TEAM_NAMES, type TeamId } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Item = {
  id: string;
  day: number;
  team_id: TeamId;
  kind: "topic" | "person" | "gap";
  title: string;
  done: boolean;
  detail: { question?: string; why?: string; title?: string; status?: string; topic_id?: string };
};
type Path = { day: number; days: number; teams: { team_id: TeamId; name: string }[]; items: Item[]; progress: { done: number; total: number } };

const KIND = {
  topic: { icon: MessageSquare, label: "Learn" },
  person: { icon: UserRound, label: "Meet" },
  gap: { icon: CircleHelp, label: "Known gap" },
};

export default function RampupPage() {
  const { user, version } = useDemoUser();
  const [path, setPath] = useState<Path | null>(null);

  const load = useCallback(() => {
    if (user) api<Path>(`/rampup/${user.id}`).then(setPath);
  }, [user]);
  useEffect(load, [load, version]);

  if (!path || !user) return <p className="text-sm text-navy-600">Loading…</p>;
  const toggle = (id: string) =>
    post(`/rampup/items/${id}/toggle`).then(() =>
      setPath((p) => p && { ...p, items: p.items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)), progress: { ...p.progress, done: p.progress.done + (p.items.find((i) => i.id === id)!.done ? -1 : 1) } }),
    );
  const pct = path.progress.total ? Math.round((path.progress.done / path.progress.total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Ramp-up path</h1>
          <p className="text-sm text-navy-600">
            Two weeks across {TEAM_NAMES[user.team_id]} and the teams it depends on: {path.teams.filter((t) => t.team_id !== user.team_id).map((t) => t.name).join(", ") || "none"}.
          </p>
        </div>
        <div className="w-64">
          <p className="mb-1 flex justify-between text-sm text-navy-600">
            <span>
              Day {path.day} of {path.days}
            </span>
            <span>
              {path.progress.done}/{path.progress.total} done
            </span>
          </p>
          <div className="h-2 rounded-full bg-pill-mute" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2 rounded-full bg-red-600" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>

      {path.teams.map((t) => {
        const items = path.items.filter((i) => i.team_id === t.team_id);
        const days = [...new Set(items.map((i) => i.day))];
        return (
          <Card key={t.team_id} className="p-0">
            <header className="flex items-center gap-3 border-b px-5 py-3">
              <Avatar team={t.team_id} />
              <h2 className="font-semibold">{t.name}</h2>
              <span className="text-sm text-navy-600">
                Days {Math.min(...days)}–{Math.max(...days)}
              </span>
            </header>
            <ol className="divide-y">
              {items.map((i) => {
                const K = KIND[i.kind];
                return (
                  <li key={i.id} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <label className="-my-2 flex min-h-tap min-w-tap items-center justify-center">
                      <input type="checkbox" checked={i.done} onChange={() => toggle(i.id)} aria-label={`Done: ${i.title}`} className="h-5 w-5 accent-red-600" />
                    </label>
                    <span className="w-14 shrink-0 pt-0.5 text-sm text-navy-600">Day {i.day}</span>
                    <K.icon className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" aria-hidden />
                    <div className={i.done ? "flex-1 text-navy-600 line-through" : "flex-1"}>
                      <span className="mr-2 text-sm font-medium text-navy-600">{K.label}</span>
                      {i.kind === "topic" ? (
                        <Link href={`/ask?q=${encodeURIComponent(i.detail.question ?? i.title)}`} className="font-medium hover:underline">
                          {i.title}
                        </Link>
                      ) : (
                        <span className="font-medium">{i.title}</span>
                      )}
                      {i.kind === "person" && <span className="text-navy-600"> · {i.detail.title} · {i.detail.why}</span>}
                      {i.kind === "topic" && <span className="text-navy-600"> · opens Ask with &ldquo;{i.detail.question}&rdquo;</span>}
                      {i.kind === "gap" && (
                        <span className="text-navy-600">
                          {" "}
                          · {i.detail.why} <Pill tone="bad">Undocumented</Pill>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </Card>
        );
      })}
    </div>
  );
}
