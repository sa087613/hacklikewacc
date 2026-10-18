import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { Pill } from "@/components/ui/pill";
import { cn } from "@/lib/utils";

/** Rail item: 44px, 20px icon, active = white pill with navy text. compact = bottom tab bar. */
export function NavItem({
  href,
  label,
  icon: Icon,
  count,
  active,
  compact,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  active: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        aria-label={count ? `${label}, ${count} new` : label}
        className={cn(
          "relative flex min-h-tap min-w-tap flex-1 flex-col items-center justify-center gap-0.5 rounded-btn text-[10px] font-medium",
          active ? "bg-card text-navy-900" : "text-white/75",
        )}
      >
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        <span className="max-w-full truncate px-0.5">{label}</span>
        {count ? <span className="absolute right-1 top-0.5 h-2 w-2 rounded-full bg-red-600" aria-hidden /> : null}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-tap items-center gap-3 rounded-btn px-3.5 text-[15px] font-medium transition-colors",
        active ? "bg-card text-navy-900" : "text-white/80 hover:bg-white/10 hover:text-white",
      )}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex-1">{label}</span>
      {count ? <Pill tone="count">{count}</Pill> : null}
    </Link>
  );
}
