import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

// Pill with status color at 12% fill and full-color text (§8.5).
const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: {
    status: {
      good: "bg-status-good/[.12] text-status-good",
      warn: "bg-status-warn/[.12] text-status-warn",
      critical: "bg-status-critical/[.12] text-status-critical",
      info: "bg-status-info/[.12] text-status-info",
      neutral: "bg-status-neutral/[.12] text-status-neutral",
      count: "min-w-5 justify-center bg-adp-red px-1.5 text-white",
    },
  },
  defaultVariants: { status: "neutral" },
});

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, status, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ status }), className)} {...props} />;
}
