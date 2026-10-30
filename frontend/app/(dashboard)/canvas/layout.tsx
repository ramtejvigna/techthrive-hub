import { RequireAuth } from "@/components/auth/auth-guard";

export default function CanvasAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RequireAuth>{children}</RequireAuth>;
}
