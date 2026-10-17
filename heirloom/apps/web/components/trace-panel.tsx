import { Bot, Check, FileSearch, GitBranch, Inbox, ShieldCheck, Sparkles } from "lucide-react";
import type { AnswerCard, TraceStep } from "@/lib/api";
import { KEEPER_NAMES, TEAM_NAMES } from "@/lib/api";

const ICON: Record<string, typeof Bot> = {
  search: FileSearch,
  search_done: FileSearch,
  ask_agent: GitBranch,
  agent_done: GitBranch,
  blocked: GitBranch,
  compose: Sparkles,
  verify: ShieldCheck,
  route: Inbox,
  done: Check,
};

/** "How this was answered": agents consulted, sources used, latency (§9.2). */
export function TracePanel({ card, steps }: { card: AnswerCard | null; steps: TraceStep[] }) {
  return (
    <div className="space-y-5">
      <ol className="space-y-2.5">
        {steps.map((s, i) => {
          const Icon = ICON[s.kind] ?? Bot;
          return (
            <li key={i} className="flex gap-2 text-sm">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-adp-navy-700" aria-hidden />
              <span className="flex-1">{s.text}</span>
              <span className="tabular-nums text-xs text-muted">{s.ms} ms</span>
            </li>
          );
        })}
        {steps.length === 0 && <li className="text-sm text-muted">Ask a question to see how it's answered.</li>}
      </ol>
      {card && (
        <>
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Agents</h3>
            <p className="text-sm">
              {[KEEPER_NAMES[card.agent_team], ...card.consulted_teams.map((t) => KEEPER_NAMES[t])].join(" → ")}
            </p>
          </section>
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Sources used</h3>
            <ul className="space-y-1 text-sm">
              {card.sources.map((s) => (
                <li key={s.n}>
                  [{s.n}] {s.title} <span className="text-xs text-muted">· {TEAM_NAMES[s.team]}</span>
                </li>
              ))}
              {card.sources.length === 0 && <li className="text-muted">None</li>}
            </ul>
          </section>
          <section>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Citation check</h3>
            <p className="text-sm">
              {(() => {
                const n = card.points.reduce((acc, p) => acc + p.citations.length, 0);
                return `${n} quote${n === 1 ? "" : "s"} verified verbatim`;
              })()}
              {card.verification.dropped_citations > 0 && `, ${card.verification.dropped_citations} removed`}
            </p>
          </section>
        </>
      )}
    </div>
  );
}
