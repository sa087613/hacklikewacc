import * as React from "react";
import { cn } from "@/lib/utils";

export type PillTone = "ok" | "warn" | "bad" | "info" | "mute" | "count";

const TONE: Record<PillTone, string> = {
  ok: "bg-pill-ok text-pill-ok-fg",
  warn: "bg-pill-warn text-pill-warn-fg",
  bad: "bg-pill-bad text-pill-bad-fg",
  info: "bg-pill-info text-pill-info-fg",
  mute: "bg-pill-mute text-pill-mute-fg",
  count: "min-w-6 justify-center bg-red-600 px-2 text-white",
};

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
}

/** Fully round status pill. Text colors are the dark shades from the design system (never lighter). */
export function Pill({ tone = "mute", className, ...props }: PillProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-medium leading-none", TONE[tone], className)}
      {...props}
    />
  );
}
