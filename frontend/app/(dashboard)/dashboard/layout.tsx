import { RequireAuth } from "@/components/auth/auth-guard";

export default function DashboardAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
