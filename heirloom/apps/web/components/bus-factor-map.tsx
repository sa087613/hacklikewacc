"use client";

import { AlertTriangle } from "lucide-react";
import { TEAM_NAMES, TEAMS, type TeamId } from "@/lib/api";
import { cn } from "@/lib/utils";

export type Topic = {
  id: string;
  name: string;
  team_id: TeamId;
  co_owner_team_ids: TeamId[];
  bus_factor: number;
  documented: boolean;
  status: "red" | "amber" | "green";
  ask_count: number;
  overloaded: boolean;
  entry_count: number;
  doc_count: number;
  last_verified: string | null;
  expiring_soon: boolean;
  knowers: { person_id: string; name: string; title: string; departing: boolean; roles: string[] }[];
};

const TILE = {
  red: "bg-tile-red text-white",
  amber: "bg-tile-amber text-navy-900",
  green: "bg-tile-green text-pill-ok-fg",
};

/** Three-column treemap: one column per team, tile height = how often asked, color = bus factor (§5.6). */
export function BusFactorMap({ topics, selected, onSelect }: { topics: Topic[]; selected: string | null; onSelect: (t: Topic) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {TEAMS.map((team) => {
        const items = topics.filter((t) => t.team_id === team).sort((a, b) => b.ask_count - a.ask_count);
        return (
          <section key={team} aria-label={TEAM_NAMES[team]} className="space-y-2">
            <h3 className="font-semibold">{TEAM_NAMES[team]}</h3>
            {items.length === 0 && <p className="text-sm text-navy-600">No topics match.</p>}
            <div className="flex flex-col gap-2">
              {items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelect(t)}
                  aria-pressed={selected === t.id}
                  aria-label={`${t.name}: ${t.bus_factor} ${t.bus_factor === 1 ? "person knows" : "people know"} this, ${t.status}`}
                  style={{ minHeight: 64 + Math.min(t.ask_count, 6) * 18 }}
                  className={cn(
                    "flex flex-col justify-between rounded-[14px] px-4 py-3 text-left transition-shadow",
                    TILE[t.status],
                    selected === t.id ? "outline outline-2 outline-offset-2 outline-navy-900" : "hover:shadow-md",
                  )}
                >
                  <span className="flex items-start gap-1.5 font-semibold leading-snug">
                    {t.status === "red" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />}
                    {t.name}
                  </span>
                  <span className="mt-1 text-sm">
                    {t.bus_factor} {t.bus_factor === 1 ? "person" : "people"}
                    {t.ask_count > 0 && ` · asked ${t.ask_count}×`}
                    {t.expiring_soon && " · expiring"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
