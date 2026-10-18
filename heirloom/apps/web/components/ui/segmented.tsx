"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type SegmentedOption<T extends string> = { value: T; label: React.ReactNode; ariaLabel?: string };

/** A row of toggle buttons; exactly one is pressed. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
  disabled,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div role="group" aria-label={label} className={cn("inline-flex flex-wrap gap-1 rounded-btn bg-pill-mute p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          aria-label={o.ariaLabel}
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-[36px] rounded-[9px] px-3.5 text-sm font-medium text-navy-600 transition-colors disabled:opacity-50",
            o.value === value ? "bg-card text-navy-900 shadow-sm" : "hover:text-navy-900",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
