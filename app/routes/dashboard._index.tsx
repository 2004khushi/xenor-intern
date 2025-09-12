import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { Form, Link, useLoaderData, useSearchParams } from "@remix-run/react";
import prisma from "../db.server";
import { requireUserEmail } from "../utils/session.server";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  CartesianGrid, XAxis, YAxis, Tooltip, Legend,
  AreaChart, Area,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Users, ShoppingCart, DollarSign, TrendingUp,
  Download, CalendarRange, Store, LogOut,
  ArrowUp, ArrowDown, AlertCircle,
  BarChart3, Activity
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

  useEffect(() => {
    setMounted(true);
  }, []);

  const currency = useMemo(
    () => new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }),
    []
  );

  // Helper functions
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

  const COLORS = ['#ffdd00', '#ffaa00', '#ffcc00', '#ff6b00', '#ff9900'];

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="header-top">
            <div className="logo-section">
              <div className="logo">
                <BarChart3 size={24} color="black" />
              </div>
              <div>
                <h1>Analytics Dashboard</h1>
                <p>
                  <Activity size={14} /> Real-time business insights
                </p>
              </div>
            </div>
            <Link to="/logout" className="signout-btn">
              <LogOut size={16} />
              Sign out
            </Link>
          </div>

          {/* Filters */}
          <div className="filters-section">
            <Form method="get" className="filters-form">
              <div className="filter-group">
                <label>
                  <Store size={14} /> Store
                </label>
                <select name="tenant" defaultValue={data.selectedTenant}>
                  {data.tenants.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label>
                  <CalendarRange size={14} /> From
                </label>
                <input name="from" type="date" defaultValue={data.from} />
              </div>
              <div className="filter-group">
                <label>To</label>
                <input name="to" type="date" defaultValue={data.to} />
              </div>
              <div className="filter-buttons">
                <button type="submit" className="apply-btn">
                  Apply Filters
                </button>
                <button type="button" onClick={exportCSV} className="export-btn">
                  <Download size={18} />
                </button>
              </div>
            </Form>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        {/* KPIs */}
        <div className="kpi-grid">
          <KPICard
            title="Total Customers"
            icon={<Users size={20} color="black" />}
            value={data.totals.totalCustomers.toLocaleString()}
            gradient="linear-gradient(135deg, #ffdd00, #ffaa00)"
          />
          <KPICard
            title="Orders (Range)"
            icon={<ShoppingCart size={20} color="black" />}
            value={data.totals.totalOrdersInRange.toLocaleString()}
            delta={ordTrend}
            gradient="linear-gradient(135deg, #ffdd00, #ffaa00)"
          />
          <KPICard
            title="Revenue (Range)"
            icon={<DollarSign size={20} color="black" />}
            value={currency.format(data.totals.totalRevenueInRange)}
            delta={revTrend}
            positiveIsGood
            gradient="linear-gradient(135deg, #ffdd00, #ffaa00)"
          />
          <KPICard
            title="Avg Order Value"
            icon={<TrendingUp size={20} color="black" />}
            value={currency.format(data.totals.avgOrderValue)}
            gradient="linear-gradient(135deg, #ffdd00, #ffaa00)"
          />
        </div>

        {/* Charts */}
        <div className="chart-section">
          <div className="chart-card">
            <h2>
              <Activity size={20} /> Revenue & Orders Timeline
            </h2>
            {mounted && data.series.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.series}>
                  <defs>
                    <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffdd00" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#ffdd00" stopOpacity={0.1}/>
                    </linearGradient>
                    <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ffaa00" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#ffaa00" stopOpacity={0.1}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis dataKey="date" stroke="#ffdd00" />
                  <YAxis yAxisId="revenue" orientation="left" stroke="#ffdd00" />
                  <YAxis yAxisId="orders" orientation="right" stroke="#ffaa00" />
                  <Tooltip contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} />
                  <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#ffdd00" fill="url(#revGradient)" strokeWidth={2} />
                  <Area yAxisId="orders" type="monotone" dataKey="orders" stroke="#ffaa00" fill="url(#orderGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>

        <div className="bottom-section">
          {/* Top Customers */}
          <div className="card">
            <h2>
              <Users size={20} /> Top 5 Customers
            </h2>
            {mounted && data.top.length ? (
              <div className="customers-list">
                {data.top.map((customer, index) => (
                  <div key={customer.customer_id} className="customer-card">
                    <div className="customer-info">
                      <div className="customer-avatar">
                        {index < 3 ? "🏆" : index + 1}
                      </div>
                      <div>
                        <div className="customer-name">{customer.name || "Unknown"}</div>
                        <div className="customer-email">{customer.email}</div>
                      </div>
                    </div>
                    <div className="customer-spend">
                      <div className="spend-amount">{currency.format(customer.spend)}</div>
                      <div className="spend-label">Total Spend</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyChart note="No customers in this range" />}
          </div>

          {/* Customer Distribution */}
          <div className="card">
            <h2>
              📊 Top Customer Distribution
            </h2>
            {mounted && data.top.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.top.slice(0, 3).map((customer, index) => ({
                      name: customer.name || customer.email || "Unknown",
                      value: customer.spend
                    }))}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={40}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {data.top.slice(0, 3).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => [currency.format(Number(value)), "Spend"]}
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333', borderRadius: '8px', color: 'white' }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>
      </main>

      <style>{`
        .dashboard-container {
          background-color: #0a0a0a;
          color: white;
          min-height: 100vh;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
        }

        .dashboard-header {
          background: linear-gradient(135deg, #000000 0%, #111111 100%);
          border-bottom: 1px solid #333;
          padding: 20px 0;
        }

        .header-content {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 20px;
        }

        .logo-section {
          display: flex;
          align-items: center;
          gap: 15px;
        }

        .logo {
          height: 50px;
          width: 50px;
          border-radius: 12px;
          background: linear-gradient(135deg, #ffdd00, #ffaa00);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 15px rgba(255, 221, 0, 0.3);
        }

        .logo-section h1 {
          font-size: 28px;
          font-weight: 800;
          margin: 0;
          background: linear-gradient(90deg, #ffdd00, #ffaa00);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .logo-section p {
          color: #ffdd00;
          margin: 5px 0 0;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .signout-btn {
          display: inline-flex;
          align-items: center;
          background: linear-gradient(135deg, #ffdd00, #ffaa00);
          color: black;
          padding: 12px 24px;
          border-radius: 30px;
          text-decoration: none;
          font-weight: 700;
          box-shadow: 0 4px 15px rgba(255, 221, 0, 0.3);
          transition: all 0.3s ease;
        }

        .signout-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 221, 0, 0.4);
        }

        .signout-btn svg {
          margin-right: 8px;
        }

        .filters-section {
          background: rgba(30, 30, 30, 0.7);
          border-radius: 16px;
          border: 1px solid #333;
          padding: 20px;
          backdrop-filter: blur(10px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        .filters-form {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 15px;
          align-items: end;
        }

        .filter-group label {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #ffdd00;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        .filter-group select,
        .filter-group input {
          width: 100%;
          padding: 12px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid #444;
          color: white;
          font-size: 14px;
        }

        .filter-buttons {
          display: flex;
          gap: 10px;
        }

        .apply-btn {
          flex: 1;
          padding: 12px 20px;
          border-radius: 30px;
          background: linear-gradient(135deg, #ffdd00, #ffaa00);
          color: black;
          border: none;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(255, 221, 0, 0.3);
          transition: all 0.3s ease;
          font-size: 14px;
        }

        .apply-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(255, 221, 0, 0.4);
        }

        .export-btn {
          padding: 12px;
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid #444;
          color: #ffdd00;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
        }

        .export-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        .dashboard-main {
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 20px;
          margin-bottom: 30px;
        }

        .chart-section {
          margin-bottom: 30px;
        }

        .chart-card {
          background: #111;
          border-radius: 16px;
          border: 1px solid #333;
          padding: 25px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        .chart-card h2 {
          margin: 0 0 20px;
          font-size: 20px;
          font-weight: 700;
          color: #ffdd00;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .bottom-section {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px;
        }

        .card {
          background: #111;
          border-radius: 16px;
          border: 1px solid #333;
          padding: 25px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
        }

        .card h2 {
          margin: 0 0 20px;
          font-size: 20px;
          font-weight: 700;
          color: #ffdd00;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .customers-list {
          display: flex;
          flex-direction: column;
          gap: 15px;
        }

        .customer-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          border: 1px solid #333;
          transition: all 0.3s ease;
        }

        .customer-card:hover {
          background: rgba(255, 221, 0, 0.1);
          transform: translateY(-2px);
        }

        .customer-info {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .customer-avatar {
          height: 40px;
          width: 40px;
          border-radius: 10px;
          background: #ffdd00;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: black;
          box-shadow: 0 4px 10px rgba(255, 221, 0, 0.3);
        }

        .customer-name {
          font-weight: 600;
          color: white;
        }

        .customer-email {
          font-size: 14px;
          color: #ffdd00;
        }

        .customer-spend {
          text-align: right;
        }

        .spend-amount {
          font-weight: bold;
          color: #ffdd00;
        }

        .spend-label {
          font-size: 12px;
          color: #888;
        }

        .empty-chart {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 200px;
          text-align: center;
          color: #888;
        }

        .empty-chart h3 {
          margin: 0 0 8px;
          font-size: 16px;
          font-weight: 600;
          color: white;
        }

        .empty-chart p {
          margin: 0;
          font-size: 14px;
          max-width: 200px;
        }
      `}</style>
    </div>
  );
}

/* ------------------------------ UI Components ------------------------------ */

function KPICard({ title, value, icon, delta, positiveIsGood, gradient }: any) {
  const sign = delta === undefined ? undefined : delta >= 0 ? "+" : "";
  const color = delta === undefined 
    ? "#ffdd00" 
    : delta >= 0 
      ? positiveIsGood ? "#ffdd00" : "#ffaa00"
      : "#ff6b6b";

  return (
    <div className="kpi-card">
      <div className="kpi-bg" style={{ background: gradient }}></div>
      
      <div className="kpi-content">
        <div className="kpi-text">
          <div className="kpi-title">{title}</div>
          <div className="kpi-value">{value}</div>
          {delta !== undefined && (
            <div className="kpi-delta" style={{ color }}>
              {delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {sign}{Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
        <div className="kpi-icon" style={{ background: gradient }}>
          {icon}
        </div>
      </div>

      <style>{`
        .kpi-card {
          background: #111;
          border-radius: 16px;
          border: 1px solid #333;
          padding: 25px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          transition: all 0.3s ease;
        }

        .kpi-card:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 40px rgba(255, 221, 0, 0.2);
        }

        .kpi-bg {
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          opacity: 0.1;
        }

        .kpi-content {
          position: relative;
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
        }

        .kpi-text {
          flex: 1;
        }

        .kpi-title {
          font-size: 14px;
          color: #ffdd00;
          margin-bottom: 12px;
          font-weight: 600;
        }

        .kpi-value {
          font-size: 28px;
          font-weight: bold;
          color: white;
          margin-bottom: 12px;
        }

        .kpi-delta {
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
        }

        .kpi-icon {
          height: 60px;
          width: 60px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: black;
          box-shadow: 0 4px 15px rgba(255, 221, 0, 0.3);
        }
      `}</style>
    </div>
  );
}

function EmptyChart({ note = "No data available" }: { note?: string }) {
  return (
    <div className="empty-chart">
      <AlertCircle size={40} style={{ marginBottom: '15px', color: '#ffdd00' }} />
      <h3>No Data Available</h3>
      <p>
        {note}. Try adjusting your date range or selecting a different store.
      </p>
    </div>
  );
}