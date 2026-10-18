"use client";

import {
  BookOpen,
  Home,
  Inbox,
  KeyRound,
  Lightbulb,
  MessageSquare,
  Network,
  Route,
  Settings,
  WifiOff,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Notifications } from "@/components/notifications";
import { Avatar } from "@/components/ui/avatar";
import { NavItem } from "@/components/ui/nav-item";
import { Pill } from "@/components/ui/pill";
import { UserSwitcher } from "@/components/user-switcher";
import { KEEPER_NAMES } from "@/lib/api";
import { useDemoUser } from "@/lib/demo-user";

type Item = { href: string; label: string; icon: LucideIcon; badge?: "inbox" | "insights" };

const MAIN: Item[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ask", label: "Ask", icon: MessageSquare },
  { href: "/network", label: "Network", icon: Network },
  { href: "/inbox", label: "Inbox", icon: Inbox, badge: "inbox" },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/insights", label: "Insights", icon: Lightbulb, badge: "insights" },
  { href: "/rampup", label: "Ramp-up", icon: Route },
];
const SETTINGS: Item = { href: "/settings", label: "Team settings", icon: Settings };

function OfflineChip() {
  const { config } = useDemoUser();
  if (!config || config.offline.length === 0) return null;
  return (
    <Pill tone="warn" title={`Offline providers: ${config.offline.join(", ")}`}>
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      Demo mode: offline
    </Pill>
  );
}

function AskBar() {
  const { user } = useDemoUser();
  const keeper = user ? KEEPER_NAMES[user.team_id] : "your Keeper";
  return (
    <form action="/ask" role="search" className="flex min-h-tap flex-1 items-center gap-3 rounded-btn border border-line bg-card px-2.5">
      {user && <Avatar team={user.team_id} />}
      <input
        type="search"
        name="q"
        placeholder={`Ask ${keeper} anything`}
        aria-label={`Ask ${keeper} anything`}
        className="h-11 w-full bg-transparent text-[15px] placeholder:text-navy-600 focus:outline-none"
      />
    </form>
  );
}

/** The frame every page sits in: navy rail (bottom tab bar under 900px), top ask bar, content. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { badges } = useDemoUser();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const count = (i: Item) => (i.badge ? badges[i.badge] : undefined);

  return (
    <div className="min-h-screen nav:pl-[248px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col bg-navy-950 px-4 py-6 nav:flex">
        <Link href="/" className="mb-8 flex items-center gap-3 px-2" aria-label="Heirloom home">
          <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-red-600">
            <KeyRound className="h-5 w-5 text-white" aria-hidden />
          </span>
          <span className="font-serif text-[26px] font-medium text-white">Heirloom</span>
        </Link>
        <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
          {MAIN.map((i) => (
            <NavItem key={i.href} href={i.href} label={i.label} icon={i.icon} count={count(i)} active={isActive(i.href)} />
          ))}
          <div className="mx-3 my-3 border-t border-white/15" role="separator" />
          <NavItem href={SETTINGS.href} label={SETTINGS.label} icon={SETTINGS.icon} active={isActive(SETTINGS.href)} />
        </nav>
        <div className="space-y-3">
          <div className="px-2">
            <OfflineChip />
          </div>
          <UserSwitcher />
        </div>
      </aside>

      <header className="sticky top-0 z-30 border-b border-line bg-page/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1240px] items-center gap-3 px-4 py-3 nav:px-8">
          <Link href="/" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-red-600 nav:hidden" aria-label="Heirloom home">
            <KeyRound className="h-5 w-5 text-white" aria-hidden />
          </Link>
          <AskBar />
          <Notifications />
        </div>
        <div className="flex items-center justify-between gap-2 px-4 pb-2 nav:hidden">
          <OfflineChip />
          <div className="ml-auto w-56 rounded-btn bg-navy-950">
            <UserSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 pb-28 pt-8 nav:px-8 nav:pb-12">{children}</main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 flex gap-1 bg-navy-950 px-2 py-2 nav:hidden">
        {[...MAIN, SETTINGS].map((i) => (
          <NavItem key={i.href} compact href={i.href} label={i.label === "Team settings" ? "Settings" : i.label} icon={i.icon} count={count(i)} active={isActive(i.href)} />
        ))}
      </nav>
    </div>
  );
}
