import { cn } from "@/lib/utils";

/** Navy-50 numbered chip that opens the source side panel (§8.5). */
export function SourceChip({
  n,
  title,
  onClick,
  className,
}: {
  n: number;
  title: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "inline-flex max-w-[260px] items-center gap-1.5 rounded-full bg-adp-navy-50 px-2.5 py-0.5 text-xs text-adp-navy hover:bg-border",
        className,
      )}
    >
      <span className="font-semibold">[{n}]</span>
      <span className="truncate">{title}</span>
    </button>
  );
}

export function SourceMarker({ n, onClick }: { n: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ml-1 rounded bg-adp-navy-50 px-1 text-[11px] font-semibold text-adp-navy hover:bg-border"
      aria-label={`Open source ${n}`}
    >
      [{n}]
    </button>
  );
}
