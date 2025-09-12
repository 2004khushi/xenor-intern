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
  PieChart, Pie, Cell,
} from "recharts";
import {
  Users, ShoppingCart, DollarSign, TrendingUp,
  Download, CalendarRange, Store, LogOut,
  ArrowUp, ArrowDown, Sparkles, Star, AlertCircle,
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
  const [activeChart, setActiveChart] = useState("area");
  const [animationKey, setAnimationKey] = useState(0);

  useEffect(() => {
    setMounted(true);
    const interval = setInterval(() => {
      setAnimationKey(prev => prev + 1);
    }, 5000);
    return () => clearInterval(interval);
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
  const spark = data.series.slice(-7);

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

  const pieData = data.top.slice(0, 3).map((customer, index) => ({
    name: customer.name || customer.email || "Unknown",
    value: customer.spend,
    color: ["#8B5CF6", "#06D6A0", "#FFD23F"][index]
  }));

  const COLORS = ['#8B5CF6', '#06D6A0', '#FFD23F', '#FF6B6B', '#4ECDC4'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/30 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-emerald-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute -bottom-40 right-1/3 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-2000"></div>
      </div>

      {/* Floating particles */}
      {[...Array(20)].map((_, i) => (
        <div
          key={i}
          className="absolute animate-float opacity-20"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 5}s`,
            animationDuration: `${3 + Math.random() * 4}s`
          }}
        >
          <Sparkles className="h-4 w-4 text-purple-400" />
        </div>
      ))}

      {/* Header */}
      <header className="relative z-10 backdrop-blur-xl bg-white/10 border-b border-white/20 shadow-2xl">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-emerald-500 shadow-2xl flex items-center justify-center animate-pulse">
                  <BarChart3 className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-emerald-400 rounded-full animate-ping"></div>
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-white via-purple-200 to-emerald-200 bg-clip-text text-transparent">
                  Insights Dashboard
                </h1>
                <p className="text-purple-200 text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 animate-pulse" />
                  Real-time business analytics
                </p>
              </div>
            </div>
            <Link to="/logout" className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-red-500 to-pink-500 px-4 py-2 text-white font-medium shadow-lg hover:shadow-red-500/25 transition-all duration-300 hover:scale-105">
              <LogOut className="h-4 w-4 inline mr-2" />
              Sign out
              <div className="absolute inset-0 bg-gradient-to-r from-red-600 to-pink-600 transform scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-300"></div>
            </Link>
          </div>

          {/* Filters */}
          <div className="relative rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-emerald-500/10 rounded-2xl"></div>
            <Form method="get" className="relative grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-2">
                <label className="text-sm font-medium text-purple-200 flex items-center gap-2">
                  <Store className="h-4 w-4" /> Store
                </label>
                <select name="tenant" defaultValue={data.selectedTenant} className="w-full rounded-xl bg-white/20 border border-white/30 px-4 py-3 text-white placeholder-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300">
                  {data.tenants.map((t) => (
                    <option key={t} value={t} className="bg-slate-800 text-white">{t}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-purple-200 flex items-center gap-2">
                  <CalendarRange className="h-4 w-4" /> From
                </label>
                <input 
                  name="from"
                  type="date" 
                  defaultValue={data.from} 
                  className="w-full rounded-xl bg-white/20 border border-white/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-purple-200">To</label>
                <input 
                  name="to"
                  type="date" 
                  defaultValue={data.to}
                  className="w-full rounded-xl bg-white/20 border border-white/30 px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent backdrop-blur-sm transition-all duration-300"
                />
              </div>
              <div className="flex gap-3">
                <button className="flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 font-medium shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-105 transform">
                  Apply Filters
                </button>
                <button 
                  type="button"
                  onClick={exportCSV}
                  className="rounded-xl bg-white/20 border border-white/30 px-4 py-3 text-white hover:bg-white/30 transition-all duration-300 hover:scale-105 transform backdrop-blur-sm"
                >
                  <Download className="h-5 w-5" />
                </button>
              </div>
            </Form>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 space-y-8">
        {/* KPIs */}
        <section className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <KPI
            title="Total Customers"
            icon={<Users className="h-6 w-6" />}
            value={data.totals.totalCustomers.toLocaleString()}
            spark={spark.map((d) => ({ x: d.date, y: d.orders }))}
            gradient="from-blue-500 to-cyan-500"
            delay="0"
          />
          <KPI
            title="Orders (Range)"
            icon={<ShoppingCart className="h-6 w-6" />}
            value={data.totals.totalOrdersInRange.toLocaleString()}
            delta={ordTrend}
            spark={spark.map((d) => ({ x: d.date, y: d.orders }))}
            gradient="from-emerald-500 to-teal-500"
            delay="100"
          />
          <KPI
            title="Revenue (Range)"
            icon={<DollarSign className="h-6 w-6" />}
            value={currency.format(data.totals.totalRevenueInRange)}
            delta={revTrend}
            positiveIsGood
            spark={spark.map((d) => ({ x: d.date, y: d.revenue }))}
            gradient="from-purple-500 to-pink-500"
            delay="200"
          />
          <KPI
            title="Avg Order Value"
            icon={<TrendingUp className="h-6 w-6" />}
            value={currency.format(data.totals.avgOrderValue)}
            spark={spark.map((d) => ({ x: d.date, y: d.revenue }))}
            gradient="from-orange-500 to-red-500"
            delay="300"
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card title="Revenue & Orders Timeline" delay="400">
              <div className="flex gap-2 mb-4">
                {[
                  { key: "area", label: "Area", icon: Activity },
                  { key: "bar", label: "Bar", icon: BarChart3 },
                  { key: "line", label: "Line", icon: TrendingUp }
                ].map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveChart(key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-300 flex items-center gap-1 ${
                      activeChart === key
                        ? "bg-purple-500 text-white shadow-lg"
                        : "bg-white/10 text-purple-200 hover:bg-white/20"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
              {mounted && data.series.length ? (
                <ResponsiveContainer width="100%" height={350}>
                  {activeChart === "area" ? (
                    <AreaChart data={data.series} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                      <defs>
                        <linearGradient id="revGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.1}/>
                        </linearGradient>
                        <linearGradient id="orderGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#06D6A0" stopOpacity={0.8}/>
                          <stop offset="100%" stopColor="#06D6A0" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                      <XAxis dataKey="date" stroke="#ffffff60" />
                      <YAxis yAxisId="revenue" orientation="left" stroke="#8B5CF6" />
                      <YAxis yAxisId="orders" orientation="right" stroke="#06D6A0" />
                      <Tooltip 
                        contentStyle={{ 
                          background: 'rgba(15, 23, 42, 0.9)', 
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '12px',
                          color: '#fff'
                        }} 
                      />
                      <Legend />
                      <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#8B5CF6" strokeWidth={3} fill="url(#revGradient)" />
                      <Area yAxisId="orders" type="monotone" dataKey="orders" stroke="#06D6A0" strokeWidth={3} fill="url(#orderGradient)" />
                    </AreaChart>
                  ) : activeChart === "bar" ? (
                    <BarChart data={data.series} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                      <XAxis dataKey="date" stroke="#ffffff60" />
                      <YAxis stroke="#ffffff60" />
                      <Tooltip 
                        contentStyle={{ 
                          background: 'rgba(15, 23, 42, 0.9)', 
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '12px',
                          color: '#fff'
                        }} 
                      />
                      <Legend />
                      <Bar dataKey="orders" fill="#06D6A0" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="revenue" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  ) : (
                    <LineChart data={data.series} margin={{ left: 20, right: 20, top: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff20" />
                      <XAxis dataKey="date" stroke="#ffffff60" />
                      <YAxis stroke="#ffffff60" />
                      <Tooltip 
                        contentStyle={{ 
                          background: 'rgba(15, 23, 42, 0.9)', 
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '12px',
                          color: '#fff'
                        }} 
                      />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#8B5CF6" strokeWidth={3} dot={{ fill: '#8B5CF6', strokeWidth: 2, r: 4 }} />
                      <Line type="monotone" dataKey="orders" stroke="#06D6A0" strokeWidth={3} dot={{ fill: '#06D6A0', strokeWidth: 2, r: 4 }} />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </Card>
          </div>

          <div>
            <Card title="Top Customer Distribution" delay="500">
              {mounted && pieData.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      paddingAngle={5}
                      dataKey="value"
                      animationBegin={0}
                      animationDuration={1000}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => [currency.format(value), "Spend"]}
                      contentStyle={{ 
                        background: 'rgba(15, 23, 42, 0.9)', 
                        border: '1px solid rgba(255,255,255,0.2)',
                        borderRadius: '12px',
                        color: '#fff'
                      }} 
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyChart />}
            </Card>
          </div>
        </section>

        <section>
          <Card title="Top 5 Customers" delay="600">
            {mounted && data.top.length ? (
              <div className="space-y-4">
                {data.top.map((customer, index) => (
                  <div
                    key={customer.customer_id}
                    className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-300 transform hover:scale-105"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${
                        index === 0 ? "from-yellow-400 to-yellow-600" :
                        index === 1 ? "from-gray-300 to-gray-500" :
                        index === 2 ? "from-orange-400 to-orange-600" :
                        "from-purple-400 to-purple-600"
                      } flex items-center justify-center shadow-lg`}>
                        {index < 3 ? (
                          <Star className="h-5 w-5 text-white" />
                        ) : (
                          <span className="text-white font-bold">{index + 1}</span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium text-white">{customer.name || "Unknown"}</div>
                        <div className="text-sm text-purple-200">{customer.email}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg text-emerald-400">{currency.format(customer.spend)}</div>
                      <div className="text-xs text-purple-200">Total Spend</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyChart note="No customers in this range" />}
          </Card>
        </section>
      </main>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }
        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slideUp {
          animation: slideUp 0.6s ease-out forwards;
          opacity: 0;
        }
      `}</style>
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
  gradient,
  delay,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  delta?: number;
  positiveIsGood?: boolean;
  spark?: { x: string; y: number }[];
  gradient: string;
  delay: string;
}) {
  const sign = delta === undefined ? undefined : delta >= 0 ? "+" : "";
  const color = delta === undefined 
    ? "text-purple-200" 
    : delta >= 0 
      ? positiveIsGood ? "text-emerald-400" : "text-yellow-400"
      : "text-red-400";

  return (
    <div 
      className="group relative overflow-hidden rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 shadow-2xl hover:shadow-purple-500/20 transition-all duration-500 hover:scale-105 transform animate-slideUp"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-500`}></div>
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1">
          <div className="text-sm text-purple-200 mb-2 font-medium">{title}</div>
          <div className="text-3xl font-bold text-white mb-2">{value}</div>
          {delta !== undefined && (
            <div className={`text-sm flex items-center gap-1 ${color}`}>
              {delta >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              {sign}{Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
        <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
      </div>
      
      {spark && spark.length > 1 && (
        <div className="mt-4 h-16 opacity-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spark}>
              <Line 
                type="monotone" 
                dataKey="y" 
                stroke="#ffffff" 
                strokeWidth={2} 
                dot={false} 
                strokeOpacity={0.8}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function Card({ title, children, delay = "0" }: { title: string; children: React.ReactNode; delay?: string }) {
  return (
    <div 
      className="rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 p-6 shadow-2xl hover:shadow-purple-500/10 transition-all duration-500 animate-slideUp"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-bold text-xl text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ note = "No data available" }: { note?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="rounded-full bg-white/10 p-6 mb-4">
        <AlertCircle className="h-12 w-12 text-purple-300" />
      </div>
      <h3 className="text-lg font-medium text-white mb-2">No Data Available</h3>
      <p className="text-purple-200 text-sm max-w-xs">
        {note}. Try adjusting your date range or selecting a different store.
      </p>
      <div className="mt-4 flex gap-2">
        <div className="h-2 w-2 bg-purple-400 rounded-full animate-pulse"></div>
        <div className="h-2 w-2 bg-purple-400 rounded-full animate-pulse delay-100"></div>
        <div className="h-2 w-2 bg-purple-400 rounded-full animate-pulse delay-200"></div>
      </div>
    </div>
  );
}