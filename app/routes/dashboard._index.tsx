import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams, Link } from "@remix-run/react";
import prisma from "../db.server";
import { requireUserEmail } from "../utils/session.server";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  BarChart, Bar
} from "recharts";

type SeriesRow = { date: string; orders: number; revenue: number };
type TopRow = { customer_id: string | null; email: string | null; name: string | null; spend: number };

export async function loader({ request }: LoaderFunctionArgs) {
  await requireUserEmail(request);

  const url = new URL(request.url);
  const tenant = url.searchParams.get("tenant") ?? undefined;

  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : defaultFrom;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : today;

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
          where: { tenant_id: selectedTenant, created_at: { gte: from, lte: to } },
        })
      : Promise.resolve(0),
    selectedTenant
      ? prisma.order.aggregate({
          where: { tenant_id: selectedTenant, created_at: { gte: from, lte: to } },
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
          AND created_at >= ${from}
          AND created_at <= ${to}
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
          AND o.created_at >= ${from}
          AND o.created_at <= ${to}
        GROUP BY 1,2,3
        ORDER BY spend DESC
        LIMIT 5
      `
    : [];

  const totalRevenueInRange = Number(ordersInRangeAgg ? (revenueInRangeAgg._sum.total_price ?? 0) : 0);
  return json({
    tenants,
    selectedTenant,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
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

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [search] = useSearchParams();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const currency = useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }),
    []
  );

  return (
    <div className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Insights Dashboard</h1>
        <div className="text-sm">
          <Link to="/logout" className="underline">Sign out</Link>
        </div>
      </header>

      {/* Filters */}
      <Form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">Store (tenant)</label>
          <select name="tenant" defaultValue={data.selectedTenant} className="border rounded px-2 py-1">
            {data.tenants.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">From</label>
          <input name="from" type="date" defaultValue={data.from} className="border rounded px-2 py-1"/>
        </div>
        <div className="flex flex-col">
          <label className="text-xs text-gray-600">To</label>
          <input name="to" type="date" defaultValue={data.to} className="border rounded px-2 py-1"/>
        </div>
        <button className="rounded bg-black text-white px-4 py-2">Apply</button>
      </Form>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi title="Total customers" value={data.totals.totalCustomers.toLocaleString()} />
        <Kpi title="Orders (in range)" value={data.totals.totalOrdersInRange.toLocaleString()} />
        <Kpi title="Revenue (in range)" value={currency.format(data.totals.totalRevenueInRange)} />
        <Kpi title="Avg order value" value={currency.format(data.totals.avgOrderValue)} />
      </div>

      {/* Charts */}
      {mounted && (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card title="Revenue by day">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card title="Orders by day">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.series}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="orders" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>

          <section>
            <Card title="Top 5 customers by spend (in range)">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart
                  data={[...data.top].reverse()} // show highest at top
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tickFormatter={(t: string) => (t?.trim() ? t : "Unknown")}
                  />
                  <Tooltip formatter={(v: any) => currency.format(Number(v))} />
                  <Legend />
                  <Bar dataKey="spend" />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: string }) {
  return (
    <div className="border rounded p-4">
      <div className="text-sm text-gray-600">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded p-4">
      <div className="font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}
