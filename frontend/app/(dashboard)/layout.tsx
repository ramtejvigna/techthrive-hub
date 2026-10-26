import { QuickRail } from "@/components/layout/quick-rail";
import { TopNav } from "@/components/layout/top-nav";
import { ThemeToggleCompact } from "@/components/theme-toggle-compact";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="tech-canvas flex h-dvh min-h-0 flex-col overflow-hidden">
        <TopNav />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto xl:pl-16">
          {children}
        </main>
      </div>
      {/* Fixed chrome lives outside the canvas so it never takes part in its flex layout. */}
      <QuickRail />
      {/* The rail (with its theme toggle) is desktop-only. */}
      <div className="fixed bottom-4 left-4 z-30 xl:hidden">
        <ThemeToggleCompact />
      </div>
    </>
  );
}
