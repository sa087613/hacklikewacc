import { KeyRound } from "lucide-react";
import { KEEPER_NAMES, type TeamId } from "@/lib/api";
import { cn } from "@/lib/utils";

const TEAM_BG: Record<TeamId, string> = { payroll: "bg-team-payroll", benefits: "bg-team-benefits", time: "bg-team-time" };
const INITIAL: Record<TeamId, string> = { payroll: "P", benefits: "B", time: "T" };
const SIZE = { sm: "h-8 w-8 text-sm rounded-[9px]", md: "h-10 w-10 text-base rounded-[11px]", xl: "h-[92px] w-[92px] text-[34px] rounded-[24px]" };

/** Team Keeper: rounded square in the team color with a key (§7). Person: circle with initials. */
export function Avatar(
  props: ({ team: TeamId; name?: never } | { name: string; team?: never }) & { size?: keyof typeof SIZE; className?: string },
) {
  const size = props.size ?? "sm";
  if (props.team) {
    const t = props.team;
    return (
      <span
        role="img"
        aria-label={KEEPER_NAMES[t]}
        className={cn("relative inline-flex shrink-0 items-center justify-center font-semibold text-white", TEAM_BG[t], SIZE[size], props.className)}
      >
        {INITIAL[t]}
        <span className={cn("absolute flex items-center justify-center rounded-full border border-white bg-card", size === "xl" ? "-bottom-2 -right-2 h-8 w-8" : "-bottom-1 -right-1 h-4 w-4")}>
          <KeyRound className={cn("text-navy-900", size === "xl" ? "h-4 w-4" : "h-2.5 w-2.5")} aria-hidden />
        </span>
      </span>
    );
  }
  const initials = props.name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-pill-mute font-semibold text-pill-mute-fg", SIZE[size], "rounded-full", props.className)}
    >
      {initials}
    </span>
  );
}
