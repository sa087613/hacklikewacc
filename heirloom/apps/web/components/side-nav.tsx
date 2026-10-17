"use client";

import {
  BookOpen,
  Home,
  Inbox,
  Lightbulb,
  MessageSquare,
  Network,
  Route,
  Settings,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon; count?: number };

// Badge counts (Inbox, Insights) are wired to live data in M4 and M7.
const MAIN: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ask", label: "Ask", icon: MessageSquare },
  { href: "/network", label: "Network", icon: Network },
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/rampup", label: "Ramp-up", icon: Route },
];
const FOOTER: NavItem[] = [{ href: "/settings", label: "Team settings", icon: Settings }];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 px-5 py-2.5 text-sm text-adp-navy-700 hover:bg-adp-navy-50",
        active && "bg-adp-navy-50 font-semibold text-adp-navy",
      )}
    >
      {active && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-adp-red" />}
      <Icon className="h-4 w-4" aria-hidden />
      <span className="flex-1">{item.label}</span>
      {item.count ? <Badge status="count">{item.count}</Badge> : null}
    </Link>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav aria-label="Main" className="sticky top-14 flex h-[calc(100vh-3.5rem)] w-[232px] shrink-0 flex-col border-r bg-surface py-3">
      {MAIN.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} />
      ))}
      <div className="mx-5 my-3 border-t" />
      {FOOTER.map((item) => (
        <NavLink key={item.href} item={item} active={isActive(item.href)} />
      ))}
    </nav>
  );
}
