import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import prisma from "../db.server";
import { requireUserEmail } from "../utils/session.server";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart, Line,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  AreaChart, Area,
  BarChart, Bar,
} from "recharts";
import {
  Users, ShoppingCart, DollarSign, TrendingUp,
  Download, CalendarRange, Store, LogOut,
} from "lucide-react";

/* ----------------------------- Loader (server) ---------------------------- */

type SeriesRow = { date: string; orders: number; revenue: number };
type TopRow = { customer_id: string | null; email: string | null; name: string | null; spend: number };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserEmail(request);

  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") ?? undefined;

  // dates (inclusive end-of-day)
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : defaultFrom;
  const to = toParam ? new Date(toParam) : today;
  const fromStart = new Date(from); fromStart.setHours(0, 0, 0, 0);
  const toEnd = new Date(to);       toEnd.setHours(23, 59, 59, 999);

  // tenants (distinct)
  const tenants = (await prisma.$queryRaw<{ tenant_id: string }[]>`
    SELECT DISTINCT tenant_id FROM orders
    UNION
    SELECT DISTINCT tenant_id FROM products
    UNION
    SELECT DISTINCT tenant_id FROM customers
  `).map((r) => r.tenant_id).sort();

  const selectedTenant = tenant ?? tenants[0] ?? "";

  // totals (all-time customers; in-range orders & revenue)
  const [totalCustomers, ordersInRangeAgg, revenueInRangeAgg] = await Promise.all([
    selectedTenant
      ? prisma.customer.count({ where: { tenant_id: selectedTenant } })
      : Promise.resolve(0),
    selectedTenant
      ? prisma.order.count({
          where: { tenant_id: selectedTenant, created_at: { gte: fromStart, lte: toEnd } },
        })
      : Promise.resolve(0),
    selectedTenant
      ? prisma.order.aggregate({
          where: { tenant_id: selectedTenant, created_at: { gte: fromStart, lte: toEnd } },
          _sum: { total_price: true },
        })
      : Promise.resolve({ _sum: { total_price: 0 } }),
  ]);

  // series per day
  const series = selectedTenant
    ? await prisma.$queryRaw<SeriesRow[]>`
        SELECT
          to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS date,
          COUNT(*)::int AS orders,
          COALESCE(SUM(total_price), 0)::float AS revenue
        FROM orders
        WHERE tenant_id = ${selectedTenant}
          AND created_at >= ${fromStart}
          AND created_at <= ${toEnd}
        GROUP BY 1
        ORDER BY 1
      `
    : [];

  // top 5 customers by spend
  const top = selectedTenant
    ? await prisma.$queryRaw<TopRow[]>`
        SELECT
          c.shopify_id AS customer_id,
          c.email,
          (COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS name,
          COALESCE(SUM(o.total_price),0)::float AS spend
        FROM orders o
        LEFT JOIN customers c
          ON c.tenant_id = o.tenant_id AND c.shopify_id = o.customer_id
        WHERE o.tenant_id = ${selectedTenant}
          AND o.created_at >= ${fromStart}
          AND o.created_at <= ${toEnd}
        GROUP BY 1,2,3
        ORDER BY spend DESC
        LIMIT 5
      `
    : [];

  const totalRevenueInRange = Number(revenueInRangeAgg._sum.total_price ?? 0);

  return json({
    tenants,
    selectedTenant,
    from: fromStart.toISOString().slice(0, 10),
    to: toEnd.toISOString().slice(0, 10),
    totals: {
      totalCustomers,
      totalOrdersInRange: ordersInRangeAgg,
      totalRevenueInRange,
      avgOrderValue: ordersInRangeAgg ? totalRevenueInRange / Math.max(ordersInRangeAgg, 1) : 0,
    },
    series,
    top,
  });
}

/* ----------------------------- Component (UI) ----------------------------- */

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [mounted, setMounted] = useState(false);
  const [search] = useSearchParams();
  useEffect(() => setMounted(true), []);

  const currency = useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }),
    []
  );

  // helpers
  function trendPercent(series: any[], key: "revenue" | "orders") {
    if (!series?.length) return 0;
    const mid = Math.floor(series.length / 2) || 1;
    const first = series.slice(0, mid).reduce((s, r) => s + Number(r[key] || 0), 0);
    const second = series.slice(mid).reduce((s, r) => s + Number(r[key] || 0), 0);
    if (!first && !second) return 0;
    if (!first) return 100;
    return ((second - first) / first) * 100;
  }
  const revTrend = trendPercent(data.series, "revenue");
  const ordTrend = trendPercent(data.series, "orders");
  const spark = data.series.slice(-12);

  function exportCSV() {
    const rows: string[] = [];
    rows.push("type,date,orders,revenue");
    data.series.forEach((r) =>
      rows.push(["series", r.date, String(r.orders), String(r.revenue)].join(","))
    );
    rows.push("");
    rows.push("top,customer,email,spend");
    data.top.forEach((t) =>
      rows.push([
        "top",
        (t.name || t.customer_id || "Unknown").replaceAll(",", " "),
        (t.email || "").replaceAll(",", " "),
        String(t.spend ?? 0),
      ].join(","))
    );
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dashboard-${data.selectedTenant}-${data.from}-to-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_700px_at_10%_-10%,rgba(99,102,241,0.20),transparent),radial-gradient(1000px_600px_at_90%_-20%,rgba(16,185,129,0.15),transparent)]">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-white/50 bg-white/70 dark:bg-zinc-900/70 border-b border-black/5">
        <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-emerald-500 shadow-inner" />
            <div>
              <h1 className="text-lg font-semibold">Insights Dashboard</h1>
              <p className="text-xs text-zinc-500">Business performance at a glance</p>
            </div>
          </div>
          <Link to="/logout" className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg bg-zinc-900 text-white hover:bg-black transition">
            <LogOut className="h-4 w-4" />
            Sign out
          </Link>
        </div>

        {/* Filters */}
        <div className="mx-auto max-w-7xl px-4 pb-4">
          <div className="rounded-2xl border border-black/5 bg-white/60 dark:bg-zinc-900/60 backdrop-blur p-4">
            <Form method="get" className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div className="flex flex-col">
                <label className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><Store className="h-3.5 w-3.5" /> Store</label>
                <select name="tenant" defaultValue={data.selectedTenant} className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 ring-violet-400 bg-white/80">
                  {data.tenants.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-zinc-500 mb-1 flex items-center gap-1"><CalendarRange className="h-3.5 w-3.5" /> From</label>
                <input name="from" type="date" defaultValue={data.from} className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 ring-violet-400 bg-white/80"/>
              </div>
              <div className="flex flex-col">
                <label className="text-xs text-zinc-500 mb-1">To</label>
                <input name="to" type="date" defaultValue={data.to} className="w-full rounded-lg border px-3 py-2 focus:outline-none focus:ring-2 ring-violet-400 bg-white/80"/>
              </div>
              <div className="flex gap-2">
                <button className="flex-1 rounded-lg bg-zinc-900 text-white px-4 py-2 hover:bg-black transition">
                  Apply
                </button>
                <button type="button" onClick={exportCSV}
                        className="rounded-lg border px-3 py-2 bg-white/80 hover:bg-white inline-flex items-center gap-2">
                  <Download className="h-4 w-4" /> CSV
                </button>
              </div>
            </Form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 space-y-6">
        {/* KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <KPI
            title="Total customers"
            icon={<Users className="h-5 w-5" />}
            value={data.totals.totalCustomers.toLocaleString()}
            spark={spark.map((d) => ({ x: d.date, y: d.orders }))}
          />
          <KPI
            title="Orders (in range)"
            icon={<ShoppingCart className="h-5 w-5" />}
            value={data.totals.totalOrdersInRange.toLocaleString()}
            delta={ordTrend}
            spark={spark.map((d) => ({ x: d.date, y: d.orders }))}
          />
          <KPI
            title="Revenue (in range)"
            icon={<DollarSign className="h-5 w-5" />}
            value={currency.format(data.totals.totalRevenueInRange)}
            delta={revTrend}
            positiveIsGood
            spark={spark.map((d) => ({ x: d.date, y: d.revenue }))}
          />
          <KPI
            title="Avg order value"
            icon={<TrendingUp className="h-5 w-5" />}
            value={currency.format(data.totals.avgOrderValue)}
            spark={spark.map((d) => ({ x: d.date, y: d.revenue }))}
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Revenue by day">
            {mounted && data.series.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={data.series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgb(99 102 241)" stopOpacity={0.45}/>
                      <stop offset="100%" stopColor="rgb(99 102 241)" stopOpacity={0.05}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickMargin={8}/>
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="revenue" stroke="rgb(99 102 241)" fill="url(#revGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </Card>

          <Card title="Orders by day">
            {mounted && data.series.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={data.series} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tickMargin={8}/>
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="orders" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </Card>
        </section>

        <section>
          <Card title="Top 5 customers by spend (in range)">
            {mounted && data.top.length ? (
              <ResponsiveContainer width="100%" height={360}>
                <BarChart
                  data={[...data.top].reverse()}
                  layout="vertical"
                  margin={{ left: 120, right: 16, top: 8, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey={(r: any) => (r.name?.trim() ? r.name : (r.email || r.customer_id || "Unknown"))}
                    width={180}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="spend" radius={[6, 6, 6, 6]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyChart note="No customers in this range" />}
          </Card>
        </section>
      </main>
    </div>
  );
}

/* ------------------------------ UI subcomponents ------------------------------ */

function KPI({
  title,
  value,
  icon,
  delta,
  positiveIsGood,
  spark,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  delta?: number;
  positiveIsGood?: boolean;
  spark?: { x: string; y: number }[];
}) {
  const sign = delta === undefined ? undefined : delta >= 0 ? "+" : "";
  const color =
    delta === undefined
      ? "text-zinc-500"
      : delta >= 0
      ? positiveIsGood ? "text-emerald-600" : "text-amber-600"
      : "text-rose-600";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-black/5 bg-white/70 dark:bg-zinc-900/70 backdrop-blur p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs text-zinc-500">{title}</div>
          <div className="text-2xl font-semibold">{value}</div>
          {delta !== undefined && (
            <div className={`text-xs mt-1 ${color}`}>{sign}{delta.toFixed(1)}%</div>
          )}
        </div>
        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/80 to-emerald-500/80 flex items-center justify-center text-white shadow-inner">
          {icon}
        </div>
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 h-14">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line type="monotone" dataKey="y" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white/70 dark:bg-zinc-900/70 backdrop-blur p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold">{title}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ note = "No data for this range" }: { note?: string }) {
  return (
    <div className="h-[320px] flex items-center justify-center text-sm text-zinc-500 border border-dashed rounded-xl">
      {note}
    </div>
  );
}
