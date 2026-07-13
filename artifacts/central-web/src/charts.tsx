import { useCallback, useMemo, useState, type ReactNode } from "react";

/**
 * Gráficos SVG do dashboard (sem dependências): linha/área com crosshair,
 * donut de status, barras diárias e sparkline. Especificação seguida:
 * linha 2px, área ~10%, barras ≤24px com topo arredondado de 4px e gap de 2px,
 * grid hairline sólido, tooltip que complementa (nunca é o único acesso ao valor),
 * texto sempre em tokens de texto — nunca na cor da série.
 */

export interface DayValue {
  day: string; // YYYY-MM-DD
  value: number;
}

export const fmtNum = (n: number): string => n.toLocaleString("pt-BR");

export const fmtCompact = (n: number): string =>
  n >= 10_000
    ? n.toLocaleString("pt-BR", { notation: "compact", maximumFractionDigits: 1 })
    : n.toLocaleString("pt-BR");

/** "12/07" a partir de "2026-07-12" (rótulo de eixo — sem parse de Date). */
export function dayLabel(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

/** Ticks "redondos" do eixo Y (0..max), 3 divisões. */
function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1, 2, 3];
  const rough = max / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 2.5, 5, 10].map((c) => c * pow);
  const step = candidates.find((c) => c >= rough) ?? 10 * pow;
  return [0, step, step * 2, step * 3];
}

/* ── Linha/área (série única) ─────────────────────────────────────────────── */

export function TrendChart({
  points,
  color = "var(--info)",
  formatValue = fmtNum,
}: {
  points: DayValue[];
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const W = 640, H = 240, ML = 46, MR = 18, MT = 14, MB = 28;
  const iw = W - ML - MR, ih = H - MT - MB;
  const [active, setActive] = useState<number | null>(null);

  const n = points.length;
  const ticks = useMemo(() => niceTicks(Math.max(...points.map((p) => p.value), 1)), [points]);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const x = (i: number) => ML + (n <= 1 ? iw / 2 : (i * iw) / (n - 1));
  const y = (v: number) => MT + ih - (v / yMax) * ih;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const areaPath = n > 1
    ? `${linePath} L${x(n - 1).toFixed(1)},${(MT + ih).toFixed(1)} L${x(0).toFixed(1)},${(MT + ih).toFixed(1)} Z`
    : "";

  const pick = useCallback((clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - ML) / iw) * (n - 1));
    setActive(Math.max(0, Math.min(n - 1, i)));
  }, [iw, n]);

  // Rótulos do eixo X esparsos (todos com 7 pontos; ~6 com 30).
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  const last = n - 1;
  const a = active ?? last;
  const ap = points[a];

  return (
    <div className="chart-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        role="img"
        aria-label="Evolução diária"
        tabIndex={0}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") { setActive((v) => Math.max(0, (v ?? last) - 1)); e.preventDefault(); }
          if (e.key === "ArrowRight") { setActive((v) => Math.min(last, (v ?? last) + 1)); e.preventDefault(); }
        }}
        onBlur={() => setActive(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={ML - 8} y={y(t) + 3.5} textAnchor="end" className="axis-text">{fmtCompact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => (
          (i % step === 0 || i === last) && (n <= 8 || last - i >= step || i === last) ? (
            <text key={p.day} x={x(i)} y={H - 8} textAnchor="middle" className="axis-text">{dayLabel(p.day)}</text>
          ) : null
        ))}
        {n > 1 && <path d={areaPath} fill={color} fillOpacity={0.1} />}
        {n > 1 && <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {active != null && ap && (
          <line x1={x(a)} x2={x(a)} y1={MT} y2={MT + ih} className="crosshair" />
        )}
        {/* ponto final sempre marcado + valor direto (o tooltip nunca é o único acesso) */}
        {points[last] && (
          <g>
            <circle cx={x(last)} cy={y(points[last].value)} r={4.5} fill={color} stroke="var(--panel)" strokeWidth={2} />
            <text x={Math.min(x(last), W - MR - 4)} y={y(points[last].value) - 10} textAnchor="end" className="end-label">
              {formatValue(points[last].value)}
            </text>
          </g>
        )}
        {active != null && ap && a !== last && (
          <circle cx={x(a)} cy={y(ap.value)} r={4.5} fill={color} stroke="var(--panel)" strokeWidth={2} />
        )}
      </svg>
      {active != null && ap && (
        <ChartTip xPct={(x(a) / W) * 100} yPct={(y(ap.value) / H) * 100}>
          <span className="tip-label">{dayLabel(ap.day)}</span>
          <span className="tip-row"><i className="tip-key" style={{ background: color }} /><b>{formatValue(ap.value)}</b></span>
        </ChartTip>
      )}
    </div>
  );
}

/* ── Barras diárias (série única) ─────────────────────────────────────────── */

export function BarChart({
  points,
  color = "var(--info)",
  formatValue = fmtNum,
}: {
  points: DayValue[];
  color?: string;
  formatValue?: (n: number) => string;
}) {
  const W = 640, H = 220, ML = 46, MR = 12, MT = 12, MB = 28;
  const iw = W - ML - MR, ih = H - MT - MB;
  const [active, setActive] = useState<number | null>(null);

  const n = Math.max(points.length, 1);
  const ticks = useMemo(() => niceTicks(Math.max(...points.map((p) => p.value), 1)), [points]);
  const yMax = ticks[ticks.length - 1] ?? 1;
  const band = iw / n;
  const barW = Math.min(24, Math.max(4, band - 4));
  const y = (v: number) => MT + ih - (v / yMax) * ih;
  const step = n <= 8 ? 1 : Math.ceil(n / 6);
  const last = n - 1;
  const ap = active != null ? points[active] : null;

  // Topo arredondado 4px, base reta (spec de marca).
  const barPath = (cx: number, v: number) => {
    const h = ih * (v / yMax);
    const x0 = cx - barW / 2, y0 = MT + ih - h, r = Math.min(4, h, barW / 2);
    if (h <= 0.5) return "";
    return `M${x0},${MT + ih} L${x0},${y0 + r} Q${x0},${y0} ${x0 + r},${y0} L${x0 + barW - r},${y0} Q${x0 + barW},${y0} ${x0 + barW},${y0 + r} L${x0 + barW},${MT + ih} Z`;
  };

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label="Barras diárias"
        onPointerLeave={() => setActive(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ML} x2={W - MR} y1={y(t)} y2={y(t)} className="grid-line" />
            <text x={ML - 8} y={y(t) + 3.5} textAnchor="end" className="axis-text">{fmtCompact(t)}</text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = ML + band * i + band / 2;
          return (
            <g key={p.day}>
              {/* alvo de hover maior que a marca (banda inteira) */}
              <rect x={ML + band * i} y={MT} width={band} height={ih} fill="transparent"
                onPointerEnter={() => setActive(i)} />
              <path d={barPath(cx, p.value)} fill={color} opacity={active == null || active === i ? 1 : 0.45}
                style={{ pointerEvents: "none" }} />
              {(i % step === 0 || i === last) && (n <= 8 || last - i >= step || i === last) && (
                <text x={cx} y={H - 8} textAnchor="middle" className="axis-text">{dayLabel(p.day)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {ap && active != null && (
        <ChartTip xPct={((ML + band * active + band / 2) / W) * 100} yPct={(y(ap.value) / H) * 100}>
          <span className="tip-label">{dayLabel(ap.day)}</span>
          <span className="tip-row"><i className="tip-key" style={{ background: color }} /><b>{formatValue(ap.value)}</b></span>
        </ChartTip>
      )}
    </div>
  );
}

/* ── Donut de status (parte-de-todo, ≤6 fatias, cores de estado) ──────────── */

export interface DonutSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel: string }) {
  const visible = slices.filter((s) => s.value > 0);
  const total = visible.reduce((s, x) => s + x.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const SIZE = 176, R = 62, SW = 26;
  const C = 2 * Math.PI * R;
  const GAP = visible.length > 1 ? 2 : 0;

  let acc = 0;
  const segs = visible.map((s) => {
    const frac = s.value / total;
    const len = Math.max(frac * C - GAP, 0.5);
    const seg = { ...s, len, offset: acc * C + GAP / 2, frac };
    acc += frac;
    return seg;
  });

  return (
    <div className="donut-flex">
      <div className="donut-box">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Distribuição por status: ${centerLabel}`}>
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {total === 0 && (
              <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--border-soft)" strokeWidth={SW} />
            )}
            {segs.map((s) => (
              <circle
                key={s.key}
                cx={SIZE / 2} cy={SIZE / 2} r={R}
                fill="none"
                stroke={s.color}
                strokeWidth={SW}
                strokeDasharray={`${s.len} ${C - s.len}`}
                strokeDashoffset={-s.offset}
                opacity={hover == null || hover === s.key ? 1 : 0.4}
                onPointerEnter={() => setHover(s.key)}
                onPointerLeave={() => setHover(null)}
              >
                <title>{`${s.label}: ${fmtNum(s.value)} (${Math.round(s.frac * 100)}%)`}</title>
              </circle>
            ))}
          </g>
        </svg>
        <div className="donut-center">
          <b>{fmtCompact(total)}</b>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="legend">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 1000) / 10 : 0;
          return (
            <li
              key={s.key}
              className={`legend-item ${hover != null && hover !== s.key ? "dim" : ""} ${s.value === 0 ? "zero" : ""}`}
              onPointerEnter={() => s.value > 0 && setHover(s.key)}
              onPointerLeave={() => setHover(null)}
            >
              <i className="legend-dot" style={{ background: s.color }} />
              <span className="legend-label">{s.label}</span>
              <b className="legend-value">{fmtNum(s.value)}</b>
              <span className="legend-pct">{s.value > 0 ? `${pct.toLocaleString("pt-BR")}%` : "—"}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── Sparkline (tendência 7 dias nas linhas de tabela) ────────────────────── */

export function Sparkline({ values, color = "var(--info)" }: { values: number[]; color?: string }) {
  const W = 88, H = 26, P = 3;
  const n = values.length;
  if (n === 0) return null;
  const max = Math.max(...values, 1);
  const x = (i: number) => P + (n <= 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (n - 1));
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const lastV = values[n - 1] ?? 0;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="spark" role="img"
      aria-label={`Últimos 7 dias: ${values.join(", ")}`}>
      <title>{`Entregas por dia (7d): ${values.join(" · ")}`}</title>
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(lastV)} r={2.5} fill={color} stroke="var(--panel)" strokeWidth={1.5} />
    </svg>
  );
}

/* ── Tooltip HTML posicionado sobre o SVG ─────────────────────────────────── */

function ChartTip({ xPct, yPct, children }: { xPct: number; yPct: number; children: ReactNode }) {
  const clamped = Math.max(6, Math.min(94, xPct));
  const flip = clamped > 78;
  return (
    <div
      className="chart-tip"
      style={{
        left: `${clamped}%`,
        top: `${Math.max(4, yPct)}%`,
        transform: flip ? "translate(-100%, -120%)" : clamped < 16 ? "translate(0, -120%)" : "translate(-50%, -120%)",
      }}
    >
      {children}
    </div>
  );
}
