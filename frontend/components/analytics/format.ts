const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

export const formatCount = (value: number) => compact.format(value);

export const formatPercent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

export function formatDuration(seconds: number) {
  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  return minutes > 0 ? `${minutes}m ${rounded % 60}s` : `${rounded}s`;
}

/** Local noon, so the label never slips a day in time zones behind UTC. */
export const formatDay = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Change against the previous period, or null when there's nothing to compare with. */
export function percentChange(current: number, previous: number) {
  return previous > 0 ? (current - previous) / previous : null;
}
