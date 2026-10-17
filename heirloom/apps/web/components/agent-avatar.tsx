import { KeyRound } from "lucide-react";
import { KEEPER_NAMES, type TeamId } from "@/lib/api";
import { cn } from "@/lib/utils";

const ACCENT: Record<TeamId, string> = {
  payroll: "bg-team-payroll",
  benefits: "bg-team-benefits",
  time: "bg-team-time",
};

const INITIAL: Record<TeamId, string> = { payroll: "P", benefits: "B", time: "T" };

// 32px rounded square in the team accent, white initial, small key icon (§7, §8.5).
export function AgentAvatar({ team, className }: { team: TeamId; className?: string }) {
  return (
    <span
      role="img"
      aria-label={KEEPER_NAMES[team]}
      className={cn(
        "relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-sm font-semibold text-white",
        ACCENT[team],
        className,
      )}
    >
      {INITIAL[team]}
      <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-surface">
        <KeyRound className="h-2.5 w-2.5 text-adp-navy" aria-hidden />
      </span>
    </span>
  );
}
