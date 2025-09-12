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
    color: ["#ffdd00", "#ffaa00", "#ffcc00"][index]
  }));

  const COLORS = ['#ffdd00', '#ffaa00', '#ffcc00', '#ff6b00', '#ff9900'];

  return (
    <div style={{ 
      backgroundColor: '#0a0a0a', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
      padding: '0',
      margin: '0'
    }}>
      {/* Header */}
      <header style={{ 
        backgroundColor: '#111', 
        borderBottom: '1px solid #333', 
        padding: '20px 0',
        background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 100%)'
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              <div style={{ 
                height: '50px', 
                width: '50px', 
                borderRadius: '12px', 
                background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)'
              }}>
                <BarChart3 size={24} color="black" />
              </div>
              <div>
                <h1 style={{ 
                  fontSize: '28px', 
                  fontWeight: '800', 
                  margin: '0',
                  background: 'linear-gradient(90deg, #ffdd00, #ffaa00)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  Analytics Dashboard
                </h1>
                <p style={{ color: '#ffdd00', margin: '5px 0 0', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <Activity size={14} /> Real-time business insights
                </p>
              </div>
            </div>
            <Link 
              to="/logout" 
              style={{ 
                display: 'inline-flex', 
                alignItems: 'center',
                background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                color: 'black',
                padding: '12px 24px',
                borderRadius: '30px',
                textDecoration: 'none',
                fontWeight: '700',
                boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)',
                transition: 'all 0.3s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 221, 0, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 221, 0, 0.3)';
              }}
            >
              <LogOut size={16} style={{ marginRight: '8px' }} />
              Sign out
            </Link>
          </div>

          {/* Filters */}
          <div style={{ 
            backgroundColor: 'rgba(30, 30, 30, 0.7)', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '20px',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}>
            <Form method="get" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#ffdd00', marginBottom: '8px' }}>
                  <Store size={14} style={{ display: 'inline', marginRight: '5px' }} /> Store
                </label>
                <select 
                  name="tenant" 
                  defaultValue={data.selectedTenant} 
                  style={{ 
                    width: '100%', 
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #444',
                    color: 'white',
                    fontSize: '14px'
                  }}
                >
                  {data.tenants.map((t) => (
                    <option key={t} value={t} style={{ backgroundColor: '#222', color: 'white' }}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#ffdd00', marginBottom: '8px' }}>
                  <CalendarRange size={14} style={{ display: 'inline', marginRight: '5px' }} /> From
                </label>
                <input 
                  name="from"
                  type="date" 
                  defaultValue={data.from} 
                  style={{ 
                    width: '100%', 
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #444',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#ffdd00', marginBottom: '8px' }}>
                  To
                </label>
                <input 
                  name="to"
                  type="date" 
                  defaultValue={data.to}
                  style={{ 
                    width: '100%', 
                    padding: '12px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #444',
                    color: 'white',
                    fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button style={{ 
                  flex: '1', 
                  padding: '12px 20px',
                  borderRadius: '30px',
                  background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                  color: 'black',
                  border: 'none',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)',
                  transition: 'all 0.3s ease',
                  fontSize: '14px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 221, 0, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 221, 0, 0.3)';
                }}
                >
                  Apply Filters
                </button>
                <button 
                  type="button"
                  onClick={exportCSV}
                  style={{ 
                    padding: '12px',
                    borderRadius: '30px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid #444',
                    color: '#ffdd00',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  <Download size={18} />
                </button>
              </div>
            </Form>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '30px' }}>
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px', 
              fontSize: '20px', 
              fontWeight: '700', 
              color: '#ffdd00',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
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
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#111', 
                      border: '1px solid #333',
                      borderRadius: '8px',
                      color: 'white'
                    }} 
                  />
                  <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#ffdd00" fill="url(#revGradient)" strokeWidth={2} />
                  <Area yAxisId="orders" type="monotone" dataKey="orders" stroke="#ffaa00" fill="url(#orderGradient)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Top Customers */}
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px', 
              fontSize: '20px', 
              fontWeight: '700', 
              color: '#ffdd00',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <Users size={20} /> Top 5 Customers
            </h2>
            {mounted && data.top.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {data.top.map((customer, index) => (
                  <div
                    key={customer.customer_id}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      padding: '15px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      borderRadius: '12px',
                      border: '1px solid #333',
                      transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 221, 0, 0.1)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        height: '40px', 
                        width: '40px', 
                        borderRadius: '10px', 
                        backgroundColor: '#ffdd00',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        color: 'black',
                        boxShadow: '0 4px 10px rgba(255, 221, 0, 0.3)'
                      }}>
                        {index < 3 ? <Star size={16} /> : index + 1}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: 'white' }}>{customer.name || "Unknown"}</div>
                        <div style={{ fontSize: '14px', color: '#ffdd00' }}>{customer.email}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 'bold', color: '#ffdd00' }}>{currency.format(customer.spend)}</div>
                      <div style={{ fontSize: '12px', color: '#888' }}>Total Spend</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <EmptyChart note="No customers in this range" />}
          </div>

          {/* Customer Distribution */}
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
          }}>
            <h2 style={{ 
              margin: '0 0 20px', 
              fontSize: '20px', 
              fontWeight: '700', 
              color: '#ffdd00',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <PieChart size={20} /> Top Customer Distribution
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
                    contentStyle={{ 
                      backgroundColor: '#111', 
                      border: '1px solid #333',
                      borderRadius: '8px',
                      color: 'white'
                    }} 
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : <EmptyChart />}
          </div>
        </div>
      </main>
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
    <div style={{ 
      backgroundColor: '#111', 
      borderRadius: '16px', 
      border: '1px solid #333',
      padding: '25px',
      position: 'relative',
      overflow: 'hidden',
      boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
      transition: 'all 0.3s ease'
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.transform = 'translateY(-5px)';
      e.currentTarget.style.boxShadow = '0 15px 40px rgba(255, 221, 0, 0.2)';
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = 'translateY(0)';
      e.currentTarget.style.boxShadow = '0 10px 30px rgba(0, 0, 0, 0.5)';
    }}
    >
      <div style={{ 
        position: 'absolute', 
        top: '0', 
        right: '0', 
        bottom: '0', 
        left: '0',
        background: gradient,
        opacity: '0.1'
      }}></div>
      
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: '1' }}>
          <div style={{ fontSize: '14px', color: '#ffdd00', marginBottom: '12px', fontWeight: '600' }}>{title}</div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>{value}</div>
          {delta !== undefined && (
            <div style={{ fontSize: '14px', color, display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
              {delta >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
              {sign}{Math.abs(delta).toFixed(1)}%
            </div>
          )}
        </div>
        <div style={{ 
          height: '60px', 
          width: '60px', 
          borderRadius: '12px', 
          background: gradient,
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          color: 'black',
          boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)'
        }}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function EmptyChart({ note = "No data available" }: { note?: string }) {
  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '200px',
      textAlign: 'center',
      color: '#888'
    }}>
      <AlertCircle size={40} style={{ marginBottom: '15px', color: '#ffdd00' }} />
      <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '600', color: 'white' }}>No Data Available</h3>
      <p style={{ margin: '0', fontSize: '14px', maxWidth: '200px' }}>
        {note}. Try adjusting your date range or selecting a different store.
      </p>
    </div>
  );
}