import { useId } from "react";

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Fill the area under the line with a fading gradient. */
  area?: boolean;
}

/** Smooth trend line drawn in `currentColor`. */
export function Sparkline({ values, width = 120, height = 40, className, area = false }: SparklineProps) {
  const gradientId = useId();
  const series = values.length > 1 ? values : [0, ...values, 0].slice(0, 2);
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const pad = 3;

  const points = series.map((value, index) => [
    (index / (series.length - 1)) * width,
    height - pad - ((value - min) / range) * (height - pad * 2),
  ]);

  // Cubic segments with horizontal control points keep the curve smooth without overshooting.
  const line = points.reduce((path, [x, y], index) => {
    if (index === 0) return `M${x},${y}`;
    const [px, py] = points[index - 1];
    const cx = (px + x) / 2;
    return `${path} C${cx},${py} ${cx},${y} ${x},${y}`;
  }, "");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className={className} aria-hidden>
      {area && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.22} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${line} L${width},${height} L0,${height} Z`} fill={`url(#${gradientId})`} />
        </>
      )}
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}
