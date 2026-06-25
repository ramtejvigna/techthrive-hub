import { ContentNav } from "@/components/layout/content-nav";

export default function PlansLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col overflow-y-auto bg-[var(--background)]">
      <ContentNav />
      {children}
    </div>
  );
}
