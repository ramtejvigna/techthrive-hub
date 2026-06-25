import { Sidebar } from "@/components/layout/sidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="tech-canvas flex h-dvh min-h-0 overflow-hidden">
      <Sidebar />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto bg-[var(--background)]">
        {children}
      </main>
    </div>
  );
}
