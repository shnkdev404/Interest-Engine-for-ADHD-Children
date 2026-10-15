"use client";

import { useEffect, useId, useRef, useState } from "react";

import { cx } from "@/lib/ui";

export type Series = { label: string; color: string; values: number[]; note: string };

// Minutes engaged per interest per week. Follows the dataviz rules: one axis,
// 2px lines, ringed markers, legend + direct end labels, recessive grid,
// crosshair tooltip, and a table view so nothing relies on colour alone.
export function EngagementChart({ weeks, series }: { weeks: string[]; series: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);

  // Draw at the container's real width so text stays 12-13px on phones
  // instead of being scaled down with the whole SVG.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const narrow = width < 480;
  const W = width, H = narrow ? 220 : 260, left = 36, right = narrow ? 104 : 150, top = 16, bottom = 36;
  const max = Math.max(30, ...series.flatMap((s) => s.values));
  const niceMax = Math.ceil(max / 30) * 30;
  const ticks = Array.from({ length: niceMax / 30 + 1 }, (_, i) => i * 30);
  const x = (i: number) => left + (i * (W - left - right)) / Math.max(weeks.length - 1, 1);
  const y = (v: number) => top + (1 - v / niceMax) * (H - top - bottom);

  // Spread end labels so they never overlap.
  const ends = series
    .map((s) => ({ s, y: y(s.values.at(-1) ?? 0) }))
    .sort((a, b) => a.y - b.y)
    .reduce<{ s: Series; y: number }[]>((acc, e) => {
      const prev = acc.at(-1);
      acc.push({ ...e, y: prev && e.y - prev.y < 38 ? prev.y + 38 : e.y }); // two text lines per label
      return acc;
    }, []);

  return (
    <figure className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <figcaption id={titleId} className="font-semibold">
          Minutes engaged per week, by interest
        </figcaption>
        <button type="button" onClick={() => setTable((t) => !t)} className="min-h-11 text-sm font-medium text-accent">
          {table ? "Show chart" : "Show table"}
        </button>
      </div>
      <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted" aria-label="Legend">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>

      {table ? (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-ink-muted">
              <th className="py-1 font-medium">Interest</th>
              {weeks.map((w) => (
                <th key={w} className="py-1 text-right font-medium">
                  {w}
                </th>
              ))}
              <th className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.label} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-medium">
                  {s.label}
                </th>
                {s.values.map((v, i) => (
                  <td key={i} className="py-1.5 text-right tabular-nums">
                    {v} min
                  </td>
                ))}
                <td className="py-1.5 text-right">{s.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={box} className="relative mt-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width={W}
            height={H}
            className="block max-w-full"
            role="img"
            aria-labelledby={titleId}
            onPointerLeave={() => setHover(null)}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              const px = ((e.clientX - r.left) / r.width) * W;
              const i = Math.round(((px - left) / (W - left - right)) * (weeks.length - 1));
              setHover(Math.max(0, Math.min(weeks.length - 1, i)));
            }}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
                <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={12} fill="var(--ink-muted)">
                  {t}
                </text>
              </g>
            ))}
            {weeks.map((w, i) => (
              <text key={w} x={x(i)} y={H - 12} textAnchor="middle" fontSize={12} fill="var(--ink-muted)">
                {w}
              </text>
            ))}
            {hover !== null && (
              <line x1={x(hover)} x2={x(hover)} y1={top} y2={H - bottom} stroke="var(--ink-muted)" strokeDasharray="3 3" />
            )}
            {series.map((s) => (
              <g key={s.label}>
                <polyline
                  points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.values.map((v, i) => (
                  <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 6 : 4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                ))}
              </g>
            ))}
            {ends.map(({ s, y: ly }) => (
              <g key={s.label}>
                <text x={W - right + 12} y={ly + 1} fontSize={13} fontWeight={600} fill="var(--ink)">
                  {s.label}
                </text>
                <text x={W - right + 12} y={ly + 16} fontSize={12} fill="var(--ink-muted)">
                  {s.note}
                </text>
              </g>
            ))}
          </svg>
          {hover !== null && (
            <div
              role="status"
              className={cx(
                "pointer-events-none absolute top-2 min-w-36 rounded-lg border border-line bg-surface p-2 text-sm shadow-sm",
              )}
              style={{ left: `${(x(hover) / W) * 100}%`, transform: hover > weeks.length / 2 ? "translateX(-105%)" : "translateX(8px)" }}
            >
              <p className="font-semibold">Week of {weeks[hover]}</p>
              {series.map((s) => (
                <p key={s.label} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="tabular-nums">{s.values[hover]} min</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
