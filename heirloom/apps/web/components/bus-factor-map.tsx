"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import { TEAM_NAMES, type TeamId } from "@/lib/api";
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

const TONE = {
  red: "border-status-critical bg-status-critical/[.10] text-status-critical",
  amber: "border-status-warn bg-status-warn/[.10] text-status-warn",
  green: "border-status-good bg-status-good/[.10] text-status-good",
};

/** Topics grouped by team, tile size = how often asked, color = bus factor (§5.6). */
export function BusFactorMap({ topics, selected, onSelect }: { topics: Topic[]; selected: string | null; onSelect: (t: Topic) => void }) {
  const teams = [...new Set(topics.map((t) => t.team_id))];
  return (
    <div className="space-y-5">
      {teams.map((team) => {
        const items = topics.filter((t) => t.team_id === team).sort((a, b) => b.ask_count - a.ask_count);
        return (
          <section key={team} aria-label={TEAM_NAMES[team]}>
            <h3 className="mb-2 text-sm font-semibold">{TEAM_NAMES[team]}</h3>
            <div className="flex flex-wrap gap-2">
              {items.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  style={{ flexGrow: 1 + t.ask_count, flexBasis: `${140 + Math.min(t.ask_count, 8) * 22}px` }}
                  className={cn(
                    "min-h-[78px] rounded-card border-2 px-3 py-2 text-left transition-shadow hover:shadow-md",
                    TONE[t.status],
                    selected === t.id && "ring-2 ring-adp-navy ring-offset-2",
                  )}
                  aria-label={`${t.name}: ${t.bus_factor} ${t.bus_factor === 1 ? "person knows" : "people know"} this, ${t.status}`}
                >
                  <span className="flex items-start gap-1 text-sm font-semibold text-adp-navy">
                    {t.status === "red" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-critical" aria-hidden />}
                    {t.name}
                  </span>
                  <span className="mt-1 block text-xs">
                    {t.bus_factor} {t.bus_factor === 1 ? "person" : "people"} · {t.documented ? "documented" : "undocumented"}
                    {t.ask_count > 0 && ` · asked ${t.ask_count}×`}
                  </span>
                  {(t.expiring_soon || t.overloaded) && (
                    <span className="mt-1 flex items-center gap-1 text-[11px] text-status-warn">
                      <CalendarClock className="h-3 w-3" aria-hidden />
                      {[t.expiring_soon && "expiring", t.overloaded && "expert overloaded"].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
