import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useSearchParams } from "@remix-run/react";
import {
  ResponsiveContainer,
  AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import {
  Users, ShoppingCart, DollarSign, TrendingUp,
  Download, CalendarRange, LogOut,
  BarChart3, Activity, Database, ArrowUp, ArrowDown
} from "lucide-react";
import { getUserEmail, logout } from "../utils/session.server";
import { getBusinessData } from "../utils/data.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const email = await getUserEmail(request);
  if (!email) {
    throw redirect("/login");
  }

  const url = new URL(request.url);
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");

  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 30);

  const from = fromParam ? new Date(fromParam) : thirtyDaysAgo;
  const to = toParam ? new Date(toParam) : today;

  const { series, topCustomers, totals } = await getBusinessData(from, to);

  return json({
    user: { email },
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
    series,
    topCustomers,
    totals,
  });
}

export async function action({ request }: ActionFunctionArgs) {
  return logout(request);
}

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();

  const currency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  const calculateTrend = (data: any[], key: string) => {
    if (data.length < 2) return 0;
    
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, item) => sum + item[key], 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, item) => sum + item[key], 0) / secondHalf.length;
    
    if (firstAvg === 0) return secondAvg > 0 ? 100 : 0;
    
    return ((secondAvg - firstAvg) / firstAvg) * 100;
  };

  const revenueTrend = calculateTrend(data.series, 'revenue');
  const ordersTrend = calculateTrend(data.series, 'orders');

  const exportData = () => {
    const csvContent = [
      ['Date', 'Orders', 'Revenue'],
      ...data.series.map(item => [item.date, item.orders, item.revenue])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `business-data-${data.from}-to-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const chartColors = ['#ffdd00', '#ffaa00', '#ffcc00', '#ff6b00', '#ff9900'];

  return (
    <div style={{ 
      backgroundColor: '#0a0a0a', 
      color: 'white', 
      minHeight: '100vh',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
    }}>
      {/* Header */}
      <header style={{ 
        backgroundColor: '#111', 
        borderBottom: '1px solid #222', 
        padding: '20px 0',
      }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
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
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
                  Business Insights Dashboard
                </h1>
                <p style={{ color: '#ffdd00', margin: '5px 0 0', fontSize: '14px' }}>
                  Welcome, {data.user.email}
                </p>
              </div>
            </div>
            <Form method="post">
              <button 
                type="submit"
                style={{ 
                  display: 'flex', 
                  alignItems: 'center',
                  background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                  color: 'black',
                  padding: '10px 20px',
                  borderRadius: '30px',
                  border: 'none',
                  fontWeight: '600',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)',
                }}
              >
                <LogOut size={16} style={{ marginRight: '8px' }} />
                Sign out
              </button>
            </Form>
          </div>

          {/* Filters */}
          <div style={{ 
            backgroundColor: 'rgba(30, 30, 30, 0.7)', 
            borderRadius: '12px', 
            border: '1px solid #333',
            padding: '20px',
            backdropFilter: 'blur(10px)'
          }}>
            <Form method="get" className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div>
                  <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: '#ffdd00', marginBottom: '8px' }}>
                    <CalendarRange size={14} style={{ display: 'inline', marginRight: '5px' }} /> From
                  </label>
                  <input 
                    name="from"
                    type="date" 
                    defaultValue={searchParams.get('from') || data.from}
                    style={{ 
                      width: '100%', 
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid #444',
                      color: 'white'
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
                    defaultValue={searchParams.get('to') || data.to}
                    style={{ 
                      width: '100%', 
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid #444',
                      color: 'white'
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <button 
                    type="submit"
                    style={{ 
                      flex: '1', 
                      padding: '12px 20px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                      color: 'black',
                      border: 'none',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 4px 15px rgba(255, 221, 0, 0.3)',
                    }}
                  >
                    Apply Filters
                  </button>
                  <button 
                    type="button"
                    onClick={exportData}
                    style={{ 
                      padding: '12px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      border: '1px solid #444',
                      color: '#ffdd00',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>
            </Form>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {/* KPI Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '30px' }}>
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '0', 
              right: '0', 
              bottom: '0', 
              left: '0',
              background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
              opacity: '0.1'
            }}></div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1' }}>
                <div style={{ fontSize: '14px', color: '#ffdd00', marginBottom: '12px', fontWeight: '600' }}>Total Customers</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>{data.totals.totalCustomers}</div>
              </div>
              <div style={{ 
                height: '60px', 
                width: '60px', 
                borderRadius: '12px', 
                background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'black'
              }}>
                <Users size={20} color="black" />
              </div>
            </div>
          </div>

          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '0', 
              right: '0', 
              bottom: '0', 
              left: '0',
              background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
              opacity: '0.1'
            }}></div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1' }}>
                <div style={{ fontSize: '14px', color: '#ffdd00', marginBottom: '12px', fontWeight: '600' }}>Total Orders</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>{data.totals.totalOrders}</div>
                <div style={{ fontSize: '14px', color: ordersTrend >= 0 ? '#ffdd00' : '#ff6b6b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                  {ordersTrend >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                  {Math.abs(ordersTrend).toFixed(1)}%
                </div>
              </div>
              <div style={{ 
                height: '60px', 
                width: '60px', 
                borderRadius: '12px', 
                background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'black'
              }}>
                <ShoppingCart size={20} color="black" />
              </div>
            </div>
          </div>

          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '0', 
              right: '0', 
              bottom: '0', 
              left: '0',
              background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
              opacity: '0.1'
            }}></div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1' }}>
                <div style={{ fontSize: '14px', color: '#ffdd00', marginBottom: '12px', fontWeight: '600' }}>Total Revenue</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>{currency.format(data.totals.totalRevenue)}</div>
                <div style={{ fontSize: '14px', color: revenueTrend >= 0 ? '#ffdd00' : '#ff6b6b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: '600' }}>
                  {revenueTrend >= 0 ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                  {Math.abs(revenueTrend).toFixed(1)}%
                </div>
              </div>
              <div style={{ 
                height: '60px', 
                width: '60px', 
                borderRadius: '12px', 
                background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'black'
              }}>
                <DollarSign size={20} color="black" />
              </div>
            </div>
          </div>

          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{ 
              position: 'absolute', 
              top: '0', 
              right: '0', 
              bottom: '0', 
              left: '0',
              background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
              opacity: '0.1'
            }}></div>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ flex: '1' }}>
                <div style={{ fontSize: '14px', color: '#ffdd00', marginBottom: '12px', fontWeight: '600' }}>Avg Order Value</div>
                <div style={{ fontSize: '28px', fontWeight: 'bold', color: 'white', marginBottom: '12px' }}>{currency.format(data.totals.avgOrderValue)}</div>
              </div>
              <div style={{ 
                height: '60px', 
                width: '60px', 
                borderRadius: '12px', 
                background: 'linear-gradient(135deg, #ffdd00, #ffaa00)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'black'
              }}>
                <TrendingUp size={20} color="black" />
              </div>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '20px', marginBottom: '30px' }}>
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px'
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
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.series}>
                <defs>
                  <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ffdd00" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#ffdd00" stopOpacity={0.1}/>
                  </linearGradient>
                  <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
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
                <Area yAxisId="revenue" type="monotone" dataKey="revenue" stroke="#ffdd00" fill="url(#revenueGradient)" strokeWidth={2} />
                <Area yAxisId="orders" type="monotone" dataKey="orders" stroke="#ffaa00" fill="url(#ordersGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Top Customers */}
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px'
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
              <Users size={20} /> Top 5 Customers by Spend
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {data.topCustomers.map((customer, index) => (
                <div
                  key={customer.id}
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '15px',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    borderRadius: '12px',
                    border: '1px solid #333'
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
                      color: 'black'
                    }}>
                      {index + 1}
                    </div>
                    <div>
                      <div style={{ fontWeight: '600', color: 'white' }}>{customer.name}</div>
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
          </div>

          {/* Customer Distribution */}
          <div style={{ 
            backgroundColor: '#111', 
            borderRadius: '16px', 
            border: '1px solid #333',
            padding: '25px'
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
              <Database size={20} /> Revenue Distribution
            </h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={data.topCustomers.map((customer) => ({
                    name: customer.name,
                    value: customer.spend
                  }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {data.topCustomers.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={chartColors[index % chartColors.length]} />
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
          </div>
        </div>
      </main>
    </div>
  );
}