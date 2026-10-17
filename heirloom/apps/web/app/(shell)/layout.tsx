import { SideNav } from "@/components/side-nav";
import { TopBar } from "@/components/top-bar";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      <div className="flex">
        <SideNav />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-[1200px] p-6">{children}</div>
        </main>
      </div>
    </>
  );
}
