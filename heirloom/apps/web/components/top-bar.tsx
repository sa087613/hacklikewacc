import { Bell, Search } from "lucide-react";
import { UserSwitcher } from "@/components/user-switcher";

export function TopBar() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 bg-adp-navy px-4 text-white">
      <a href="/" className="flex w-[200px] shrink-0 items-center gap-2 text-base font-semibold tracking-tight">
        <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white">
          <span className="h-2 w-2 rounded-full bg-adp-red" />
        </span>
        Heirloom
      </a>
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 rounded-[6px] bg-white/10 px-3 py-1.5">
        <Search className="h-4 w-4 text-white/70" aria-hidden />
        <input
          type="search"
          placeholder="Search Heirloom…"
          aria-label="Search Heirloom"
          className="w-full bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button aria-label="Notifications" className="rounded-[6px] p-2 hover:bg-white/10">
          <Bell className="h-5 w-5" aria-hidden />
        </button>
        <UserSwitcher />
      </div>
    </header>
  );
}
