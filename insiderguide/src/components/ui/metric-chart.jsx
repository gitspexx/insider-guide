import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip } from 'recharts';

// ---------------------------------------------------------------------------
// Accent → stroke (chart line) + text (trend label) colours. Tuned for the
// dark gold palette; still legible on the light theme.
// ---------------------------------------------------------------------------
export const ACCENTS = {
  emerald: { stroke: '#10B981', text: '#34D399' },
  rose: { stroke: '#F43F5E', text: '#FB7185' },
  neutral: { stroke: '#9a948a', text: '#c9c2b6' },
  gold: { stroke: '#C89B3C', text: '#E0B34F' },
  blue: { stroke: '#3B82F6', text: '#60A5FA' },
  violet: { stroke: '#8B5CF6', text: '#A78BFA' },
  amber: { stroke: '#F59E0B', text: '#FBBF24' },
};

// Palette used to colour multiple series when no explicit accent is given.
export const SERIES_COLORS = [
  '#C89B3C',
  '#3B82F6',
  '#10B981',
  '#8B5CF6',
  '#F59E0B',
  '#F43F5E',
];

export const formatCompact = (n) =>
  Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------
function ChartTooltip({ active, payload, valueFormatter, dateFormatter }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  return (
    <div className="pointer-events-none rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      {point?.date && (
        <p className="mb-0.5 text-[11px] text-muted-foreground">{dateFormatter(point.date)}</p>
      )}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 text-[13px] font-medium text-foreground">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {valueFormatter(Number(p.value))}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart — fills its parent; curve (area) or bars view.
// ---------------------------------------------------------------------------
export function MetricChart({
  series,
  view,
  defaultIndex,
  valueFormatter,
  dateFormatter,
}) {
  // Recharts needs one row per date with a column per series.
  const [primary] = series;
  const rows = (primary?.data ?? []).map((pt, i) => {
    const row = { date: pt.date };
    for (const s of series) row[s.name] = s.data[i]?.value ?? 0;
    return row;
  });
  // defaultIndex is accepted for API parity (active point); recharts hovers live.
  void defaultIndex;

  const tooltip = (
    <Tooltip
      cursor={{ stroke: 'var(--color-border-light)', strokeWidth: 1 }}
      content={<ChartTooltip valueFormatter={valueFormatter} dateFormatter={dateFormatter} />}
    />
  );

  if (view === 'bars') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 24, right: 8, bottom: 8, left: 8 }} barCategoryGap="24%">
          {tooltip}
          {series.map((s) => (
            <Bar key={s.name} dataKey={s.name} fill={s.color} radius={[3, 3, 0, 0]} isAnimationActive />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 24, right: 8, bottom: 8, left: 8 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.name} id={`fill-${s.name}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {tooltip}
        {series.map((s) => (
          <Area
            key={s.name}
            type="monotone"
            dataKey={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#fill-${s.name})`}
            isAnimationActive
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
