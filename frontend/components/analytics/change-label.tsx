import { percentChange } from "./format";

/** Shows the direction as an arrow and a word, so it never relies on color alone. */
export function ChangeLabel({ current, previous }: { current: number; previous: number }) {
  const change = percentChange(current, previous);
  if (change === null) return <span>No earlier data</span>;

  const percent = Math.abs(change * 100);
  if (percent < 0.05) return <span>No change</span>;

  return (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={change > 0 ? "text-emerald-500" : "text-orange-500"}>
        {change > 0 ? "▲" : "▼"}
      </span>
      {percent.toFixed(1)}% {change > 0 ? "up" : "down"}
    </span>
  );
}
