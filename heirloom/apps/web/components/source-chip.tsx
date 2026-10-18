import { cn } from "@/lib/utils";

/** Numbered chip for a source; opens it. */
export function SourceChip({ n, title, onClick, className, active }: { n: number; title: string; onClick?: () => void; className?: string; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-tap max-w-[280px] items-center gap-2 rounded-full px-3.5 text-sm",
        active ? "bg-navy-900 text-white" : "bg-pill-mute text-pill-mute-fg hover:bg-line",
        className,
      )}
    >
      <span className="font-semibold">{n}</span>
      <span className="truncate">{title}</span>
    </button>
  );
}

/** Inline citation marker after a sentence. Visually small, but with a 44px hit area. */
export function SourceMarker({ n, onClick }: { n: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Show source ${n}`}
      className="relative mx-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-pill-mute px-1.5 align-middle text-xs font-semibold text-pill-mute-fg before:absolute before:-inset-2.5 before:content-[''] hover:bg-line"
    >
      {n}
    </button>
  );
}
