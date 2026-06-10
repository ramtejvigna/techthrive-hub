import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]",
        className,
      )}
    />
  );
}
