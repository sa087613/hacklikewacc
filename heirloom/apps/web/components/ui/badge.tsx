import * as React from "react";
import { Pill, type PillTone } from "@/components/ui/pill";

// Transitional adapter: old status names → Pill tones. Removed once every page uses Pill directly.
const MAP: Record<string, PillTone> = { good: "ok", warn: "warn", critical: "bad", info: "info", neutral: "mute", count: "count" };

export function Badge({ status = "neutral", ...props }: React.HTMLAttributes<HTMLSpanElement> & { status?: string }) {
  return <Pill tone={MAP[status] ?? "mute"} {...props} />;
}
