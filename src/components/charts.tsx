'use client';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';

const AXIS = { fontSize: 12, fill: 'var(--chart-axis)' };

/** Horizontal bars, one row per category; used for status breakdowns. */
export function CategoryBars({ data, label }: { data: { name: string; value: number; color: string }[]; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure aria-label={label}>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={92} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ borderRadius: 10, fontSize: 13, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
            <Bar dataKey="value" name="Count" radius={[0, 6, 6, 0]} barSize={16}>
              {data.map((d) => <Cell key={d.name} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{data.map((d) => `${d.name}: ${d.value}`).join(', ')} (total {total})</figcaption>
    </figure>
  );
}

/** Stacked open/overdue tasks per person. Sorted by name, not by load, to avoid ranking people. */
export function WorkloadBars({ data }: { data: { name: string; open: number; overdue: number }[] }) {
  return (
    <figure aria-label="Open tasks per person">
      <div style={{ height: Math.max(160, data.length * 34 + 40) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke="var(--chart-grid)" />
            <XAxis type="number" allowDecimals={false} tick={AXIS} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={120} tick={AXIS} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'var(--muted)' }} contentStyle={{ borderRadius: 10, fontSize: 13, background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--foreground)' }} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="open" name="Open, on schedule" stackId="a" fill="#5b6cff" barSize={16} />
            <Bar dataKey="overdue" name="Overdue" stackId="a" fill="#e5576a" radius={[0, 4, 4, 0]} barSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">{data.map((d) => `${d.name}: ${d.open} open, ${d.overdue} overdue`).join('; ')}</figcaption>
    </figure>
  );
}
