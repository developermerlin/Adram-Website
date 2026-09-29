// Small, dependency-free SVG charts for the admin overview.
// Mark specs follow the dataviz method: 2px lines, ~10% area wash, 4px rounded bar ends, 8px end-dots with a
// 2px surface ring, 2px surface gaps between stacked segments, hairline grid, text in text colours only.
import { useId, useMemo, useRef, useState } from 'react';

const fmt = new Intl.NumberFormat();
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const parseDay = (iso) => new Date(`${iso}T00:00:00`);

// Clean y-axis maximum and ticks (0, 1, 2 … / 0, 5, 10 … / 0, 50, 100 …)
const niceTicks = (max, count = 4) => {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
};

// Monotone cubic curve through the points (Fritsch–Carlson): smooth, but never overshoots a value, so a
// count line never dips below zero or peaks above the real maximum.
const smoothPath = (pts) => {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ');
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i += 1) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / dx[i]);
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i += 1) t.push(m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]));
  t.push(m[n - 2]);
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + h * t[i]).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - h * t[i + 1]).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
};

/* ---------------------------------------------------------------- Sparkline (stat tiles) */

// De-emphasis grey line, with the latest point in the accent colour.
export const Sparkline = ({ values, label }) => {
  const w = 120;
  const h = 36;
  const max = Math.max(...values, 1);
  const x = (i) => (values.length === 1 ? w : (i / (values.length - 1)) * (w - 6) + 3);
  const y = (v) => h - 4 - (v / max) * (h - 10);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <path d={d} fill="none" stroke="var(--viz-muted-line)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(last)} cy={y(values[last])} r="4" fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth="2" />
    </svg>
  );
};

/* ---------------------------------------------------------------- Mini bars (KPI cards) */

// A small column chart in the card's tone. Long periods are grouped so there are never more than ~15 bars;
// the latest group is full strength, earlier ones lighter. Each bar names its dates and value on hover.
export const MiniBars = ({ series, valueKey, label, format = (v) => fmt.format(v) }) => {
  const size = Math.max(1, Math.ceil(series.length / 15));
  const groups = [];
  for (let i = series.length; i > 0; i -= size) groups.unshift(series.slice(Math.max(0, i - size), i));
  const values = groups.map((g) => g.reduce((n, p) => n + p[valueKey], 0));
  const max = Math.max(...values, 1);
  const w = 96;
  const h = 44;
  const step = w / groups.length;
  const bw = Math.min(6, step - 2);
  const span = (g) => (g.length === 1 ? dayFmt.format(parseDay(g[0].date)) : `${dayFmt.format(parseDay(g[0].date))} – ${dayFmt.format(parseDay(g[g.length - 1].date))}`);
  return (
    <svg className="minibars" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={label}>
      <line x1="0" x2={w} y1={h - 0.5} y2={h - 0.5} stroke="var(--viz-baseline)" strokeWidth="1" />
      {values.map((v, i) => {
        const bh = v ? Math.max(3, (v / max) * (h - 4)) : 1.5;
        return (
          <rect key={groups[i][0].date} x={i * step + (step - bw) / 2} y={h - 1 - bh} width={bw} height={bh} rx={Math.min(2, bw / 2)}
            className={`minibars__bar${i === values.length - 1 ? ' is-last' : ''}`}>
            <title>{`${span(groups[i])}: ${format(v)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
};

/* ---------------------------------------------------------------- Area chart with crosshair */

export const AreaChart = ({ series, valueKey, name, format = (v) => fmt.format(v), tickFormat = (v) => fmt.format(v) }) => {
  const [hover, setHover] = useState(null);
  const svgRef = useRef(null);
  const gradId = useId();
  const W = 720;
  const H = 260;
  const values = series.map((p) => p[valueKey]);
  // Leave room on the right for the direct label on the latest value (money labels are longer).
  const pad = { top: 16, right: Math.max(44, format(values[values.length - 1] ?? 0).length * 7 + 14), bottom: 30, left: 44 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;

  const ticks = useMemo(() => niceTicks(Math.max(...values, 0)), [values]);
  const top = ticks[ticks.length - 1];
  const x = (i) => pad.left + (series.length === 1 ? iw : (i / (series.length - 1)) * iw);
  const y = (v) => pad.top + ih - (v / top) * ih;

  const line = smoothPath(values.map((v, i) => [x(i), y(v)]));
  const area = `${line} L${x(values.length - 1).toFixed(1)},${pad.top + ih} L${x(0).toFixed(1)},${pad.top + ih} Z`;
  const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);

  const last = series.length - 1;
  // About six evenly spaced date labels; always label the last day, and drop a label that would crowd it.
  const labelEvery = Math.max(1, Math.ceil(series.length / 6));
  const xLabels = [];
  for (let i = 0; i < last; i += labelEvery) if (last - i >= labelEvery / 2) xLabels.push(i);
  xLabels.push(last);

  // The crosshair snaps to the nearest day under the pointer.
  const onMove = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - pad.left) / iw) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, i)));
  };
  const onKey = (e) => {
    if (e.key === 'ArrowRight') setHover((h) => Math.min(series.length - 1, (h ?? -1) + 1));
    else if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? series.length) - 1));
    else return;
    e.preventDefault();
  };

  const hp = hover !== null ? series[hover] : null;
  const tipLeft = hover !== null ? (x(hover) / W) * 100 : 0;

  return (
    <div className="area-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="area-chart__svg"
        role="img"
        aria-label={`${name} per day, ${series.length} days. Use the left and right arrow keys to read each day.`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(last)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--viz-accent)" stopOpacity="0.14" />
            <stop offset="1" stopColor="var(--viz-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-baseline)' : 'var(--viz-grid)'} strokeWidth="1" />
            <text x={pad.left - 10} y={y(t) + 4} textAnchor="end" className="viz-tick">{tickFormat(t)}</text>
          </g>
        ))}
        {xLabels.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="viz-tick">
            {dayFmt.format(parseDay(series[i].date))}
          </text>
        ))}

        <path d={area} fill={`url(#${gradId})`} />
        <path d={line} fill="none" stroke="var(--viz-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

        {/* Average reference line, labelled in text ink */}
        {avg > 0 && (
          <g className="viz-avg">
            <line x1={pad.left} x2={W - pad.right} y1={y(avg)} y2={y(avg)} stroke="var(--viz-muted)" strokeWidth="1" strokeDasharray="4 4" />
            <text x={pad.left + 6} y={y(avg) - 6} className="viz-tick">avg {format(Math.round(avg * 10) / 10)}/day</text>
          </g>
        )}

        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + ih} stroke="var(--viz-baseline)" strokeWidth="1" />
            <circle cx={x(hover)} cy={y(values[hover])} r="5" fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth="2" />
          </g>
        )}
        {/* End-dot and direct label on the latest value */}
        <circle cx={x(last)} cy={y(values[last])} r="4" fill="var(--viz-accent)" stroke="var(--viz-surface)" strokeWidth="2" />
        <text x={x(last) + 8} y={y(values[last]) + 4} className="viz-end-label">{format(values[last])}</text>
      </svg>

      {hp && (
        <div className={`viz-tooltip${tipLeft > 70 ? ' viz-tooltip--left' : ''}`} style={{ left: `${tipLeft}%` }} role="status">
          <strong>{format(hp[valueKey])}</strong>
          <span><i className="viz-key" /> {name}</span>
          <small>{longDayFmt.format(parseDay(hp.date))}</small>
        </div>
      )}
    </div>
  );
};

// The same numbers as a table, so nothing depends on hovering.
export const SeriesTable = ({ series, columns }) => (
  <div className="viz-table-wrap">
    <table className="viz-table">
      <thead>
        <tr>
          <th>Date</th>
          {columns.map((c) => <th key={c.key} className="num">{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {[...series].reverse().map((p) => (
          <tr key={p.date}>
            <td>{longDayFmt.format(parseDay(p.date))}</td>
            {columns.map((c) => <td key={c.key} className="num">{(c.format || fmt.format)(p[c.key])}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/* ---------------------------------------------------------------- Stacked status bar */

// Part-to-whole of account statuses. Status colours are fixed, and every segment is named in the legend with
// an icon, label, count and share, so colour never carries the meaning alone.
export const StatusStack = ({ segments, total }) => {
  const [hover, setHover] = useState(null);
  const shown = segments.filter((s) => s.value > 0);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  return (
    <div className="status-stack">
      <div className="status-stack__bar" role="img" aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}>
        {shown.length === 0 && <span className="status-stack__empty" />}
        {shown.map((s) => (
          <span
            key={s.key}
            className={`status-stack__seg${hover === s.key ? ' is-hover' : ''}`}
            style={{ flexGrow: s.value, background: s.color }}
            onPointerEnter={() => setHover(s.key)}
            onPointerLeave={() => setHover(null)}
          >
            {hover === s.key && (
              <span className="viz-tooltip viz-tooltip--seg" role="status">
                <strong>{fmt.format(s.value)}</strong>
                <span>{s.label} · {pct(s.value)}%</span>
              </span>
            )}
          </span>
        ))}
      </div>
      <ul className="status-stack__legend">
        {segments.map((s) => (
          <li key={s.key} onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)} className={hover === s.key ? 'is-hover' : ''}>
            <span className="status-stack__swatch" style={{ background: s.color }} />
            <i className={`fas ${s.icon} status-stack__icon`} aria-hidden="true" />
            <span className="status-stack__label">{s.label}</span>
            <strong>{fmt.format(s.value)}</strong>
            <span className="status-stack__pct">{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ---------------------------------------------------------------- Horizontal bars */

// Magnitude by length, one hue; value at each bar's tip.
export const HBars = ({ rows }) => {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="hbars">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${fmt.format(r.value)}`}>
          <span className="hbars__label">{r.label}</span>
          <span className="hbars__track">
            <span className="hbars__bar" style={{ width: r.value ? `max(${(r.value / max) * 100}%, 6px)` : 0 }} />
            <span className="hbars__value">{fmt.format(r.value)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
};

/* ---------------------------------------------------------------- Donut (part-to-whole, up to ~5 parts) */

// Segments are separated by a 2px surface gap. The centre shows the headline figure, or the hovered part.
// Every segment is named in the legend with an icon, count and share, so colour never carries the meaning alone.
export const Donut = ({ segments, centre, centreLabel, label }) => {
  const [hover, setHover] = useState(null);
  const total = segments.reduce((n, s) => n + s.value, 0);
  const pct = (v) => (total ? Math.round((v / total) * 100) : 0);
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const shown = segments.filter((s) => s.value > 0);
  const gap = shown.length > 1 ? 2 : 0;

  const lengths = shown.map((s) => (s.value / total) * C);
  const arcs = shown.map((s, i) => ({
    ...s,
    dash: `${Math.max(lengths[i] - gap, 0.5)} ${C}`,
    offset: -lengths.slice(0, i).reduce((a, b) => a + b, 0),
  }));
  const active = hover ? segments.find((s) => s.key === hover) : null;

  return (
    <div className="donut">
      <div className="donut__chart">
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img"
          aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--viz-grid)" strokeWidth={stroke} />
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === a.key ? stroke + 4 : stroke}
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
                className={`donut__arc${hover && hover !== a.key ? ' is-dim' : ''}`}
                onPointerEnter={() => setHover(a.key)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="donut__centre" aria-live="polite">
          <strong>{active ? fmt.format(active.value) : centre}</strong>
          <span>{active ? `${active.label} · ${pct(active.value)}%` : centreLabel}</span>
        </div>
      </div>
      <ul className="status-stack__legend donut__legend">
        {segments.map((s) => (
          <li key={s.key} onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)} className={hover === s.key ? 'is-hover' : ''}>
            <span className="status-stack__swatch" style={{ background: s.color }} />
            <i className={`fas ${s.icon} status-stack__icon`} aria-hidden="true" />
            <span className="status-stack__label">{s.label}</span>
            <strong>{fmt.format(s.value)}</strong>
            <span className="status-stack__pct">{pct(s.value)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

/* ---------------------------------------------------------------- Ratio meter (KPI tiles) */

// A rate as a thin one-hue bar against a full-width track; the number is the headline, the bar is context.
/* ---------------------------------------------------------------- Column chart (grouped periods) */

// One hue, 4px rounded tops anchored to the baseline, value on hover (and on the highest column).
export const ColumnChart = ({ rows, name, format = (v) => fmt.format(v), tickFormat = (v) => fmt.format(v), average = null, W = 560, H = 240 }) => {
  const [hover, setHover] = useState(null);
  const pad = { top: 22, right: 8, bottom: 30, left: 48 };
  const iw = W - pad.left - pad.right;
  const ih = H - pad.top - pad.bottom;
  const values = rows.map((r) => r.value);
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks[ticks.length - 1];
  const step = iw / rows.length;
  const bw = Math.min(40, step * 0.62);
  const y = (v) => pad.top + ih - (v / top) * ih;
  const peak = values.indexOf(Math.max(...values));
  const hr = hover !== null ? rows[hover] : null;
  // At most ~8 axis labels; always the last one.
  const labelEvery = Math.max(1, Math.ceil(rows.length / 8));
  const showLabel = (i) => i === rows.length - 1 || (i % labelEvery === 0 && rows.length - 1 - i >= labelEvery / 2);
  const avg = values.reduce((a, v) => a + v, 0) / (values.length || 1);

  return (
    <div className="area-chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="area-chart__svg column-chart" role="img"
        aria-label={`${name}: ${rows.map((r) => `${r.label} ${format(r.value)}`).join(', ')}`}
        onPointerLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--viz-baseline)' : 'var(--viz-grid)'} strokeWidth="1" />
            <text x={pad.left - 10} y={y(t) + 4} textAnchor="end" className="viz-tick">{tickFormat(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = pad.left + step * i + step / 2;
          const h = Math.max(r.value ? 3 : 0, (r.value / top) * ih);
          const r4 = Math.min(4, bw / 2, h);
          const x0 = cx - bw / 2;
          const y0 = pad.top + ih - h;
          return (
            <g key={r.key} onPointerEnter={() => setHover(i)}>
              <rect x={pad.left + step * i} y={pad.top} width={step} height={ih} fill="transparent" />
              {h > 0 && (
                <path
                  className={`column-chart__bar${hover !== null && hover !== i ? ' is-dim' : ''}`}
                  d={`M${x0},${pad.top + ih} V${y0 + r4} Q${x0},${y0} ${x0 + r4},${y0} H${x0 + bw - r4} Q${x0 + bw},${y0} ${x0 + bw},${y0 + r4} V${pad.top + ih} Z`}
                />
              )}
              {i === peak && r.value > 0 && hover === null && (
                <text x={cx} y={y0 - 6} textAnchor="middle" className="viz-end-label">{tickFormat(r.value)}</text>
              )}
              {showLabel(i) && <text x={cx} y={H - 10} textAnchor="middle" className="viz-tick">{r.label}</text>}
            </g>
          );
        })}
        {average && avg > 0 && (
          <g pointerEvents="none">
            <line x1={pad.left} x2={W - pad.right} y1={y(avg)} y2={y(avg)} stroke="var(--viz-ink-2)" strokeWidth="1" strokeDasharray="4 4" />
            <text x={pad.left + 6} y={y(avg) - 6} className="viz-tick viz-tick--strong viz-halo">{average} {format(Math.round(avg * 10) / 10)}</text>
          </g>
        )}
      </svg>
      {hr && (
        <div className={`viz-tooltip${hover / rows.length > 0.65 ? ' viz-tooltip--left' : ''}`}
          style={{ left: `${((pad.left + step * hover + step / 2) / W) * 100}%` }} role="status">
          <strong>{format(hr.value)}</strong>
          <span><i className="viz-key" /> {name}</span>
          {hr.sub && <small>{hr.sub}</small>}
        </div>
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- Heatmap (weekday x time of day) */

// Sequential: one hue, light -> dark, five steps; empty cells stay the surface grid colour.
const HEAT_STEPS = [0, 22, 42, 64, 86];
export const Heatmap = ({ grid, rowLabels, colLabels, unit = 'sign-in' }) => {
  const [hover, setHover] = useState(null);
  const max = Math.max(...grid.flat(), 0);
  const level = (v) => (v === 0 || max === 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4)));
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const busiest = grid
    .flatMap((row, r) => row.map((v, c) => ({ r, c, v })))
    .reduce((best, cell) => (cell.v > 0 && (!best || cell.v > best.v) ? cell : best), null);
  const describe = (r, c) => `${rowLabels[r]} ${colLabels[c]}: ${fmt.format(grid[r][c])} ${unit}${grid[r][c] === 1 ? '' : 's'}`;

  return (
    <div className="heatmap">
      <div className="heatmap__grid" style={{ gridTemplateColumns: `44px repeat(${colLabels.length}, minmax(0, 1fr))` }}
        role="table" aria-label={`${unit}s by day and time`} onPointerLeave={() => setHover(null)}>
        <span />
        {colLabels.map((c) => <span key={c} className="heatmap__col" role="columnheader">{c}</span>)}
        {grid.map((row, r) => [
          <span key={`l${rowLabels[r]}`} className="heatmap__row" role="rowheader">{rowLabels[r]}</span>,
          ...row.map((v, c) => (
            <span
              key={`${rowLabels[r]}-${colLabels[c]}`}
              role="cell"
              className={`heatmap__cell${hover && hover.r === r && hover.c === c ? ' is-hover' : ''}`}
              style={{ '--heat': `${HEAT_STEPS[level(v)]}%` }}
              data-empty={v === 0 || undefined}
              title={describe(r, c)}
              aria-label={describe(r, c)}
              onPointerEnter={() => setHover({ r, c })}
            />
          )),
        ])}
      </div>
      <div className="heatmap__foot">
        <span className="heatmap__readout" aria-live="polite">
          {hover
            ? describe(hover.r, hover.c)
            : busiest
              ? `Busiest: ${rowLabels[busiest.r]} ${colLabels[busiest.c]} · ${fmt.format(total)} ${unit}s in total`
              : `No ${unit}s in this period`}
        </span>
        <span className="heatmap__legend" aria-hidden="true">
          Fewer {HEAT_STEPS.map((s) => <i key={s} style={{ '--heat': `${s}%` }} data-empty={s === 0 || undefined} />)} More
        </span>
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- Conversion funnel */

// Each step's bar is its share of the first step; between steps, the share that carried on.
export const Funnel = ({ steps, footer }) => {
  const first = steps[0]?.count || 0;
  return (
    <ol className="cfunnel">
      {steps.map((s, i) => {
        const share = first ? Math.round((s.count / first) * 100) : 0;
        const prev = i > 0 ? steps[i - 1].count : null;
        const carried = prev ? Math.round((s.count / prev) * 100) : null;
        return (
          <li key={s.key} className="cfunnel__step">
            {i > 0 && (
              <span className="cfunnel__carry">
                <i className="fas fa-arrow-down-long" aria-hidden="true" /> {carried === null ? '—' : `${carried}%`} continued
              </span>
            )}
            <div className="cfunnel__row">
              <span className="cfunnel__label">{s.label}</span>
              <span className="cfunnel__value"><strong>{fmt.format(s.count)}</strong> <small>{share}%</small></span>
            </div>
            <span className="cfunnel__track">
              <span className="cfunnel__bar" style={{ width: s.count ? `max(${share}%, 6px)` : 0 }} />
            </span>
          </li>
        );
      })}
      {footer && <li className="cfunnel__foot">{footer}</li>}
    </ol>
  );
};

export const Meter = ({ value, label }) => (
  <span className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? 0} aria-label={label}>
    <span className="meter__fill" style={{ width: `${Math.min(100, Math.max(0, value ?? 0))}%` }} />
  </span>
);
