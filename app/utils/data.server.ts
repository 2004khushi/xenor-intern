import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export interface BusinessData {
  series: Array<{
    date: string;
    orders: number;
    revenue: number;
  }>;
  topCustomers: Array<{
    id: string;
    name: string;
    email: string;
    spend: number;
  }>;
  totals: {
    totalCustomers: number;
    totalOrders: number;
    totalRevenue: number;
    avgOrderValue: number;
  };
}

// Define interfaces for raw query results
interface SeriesResult {
  date: Date;
  orders: bigint;
  revenue: number | null;
}

interface CustomerResult {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  spend: number | null;
}

export async function getBusinessData(from: Date, to: Date, tenantId: string): Promise<BusinessData> {
  try {
    // Get date range for queries
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999); // End of day

    // Execute all queries in parallel with proper typing
    const [seriesData, topCustomers, totalCustomers, totalOrders, totalRevenue] = await Promise.all([
      // Get daily series data - ADDED tenant_id filter
      prisma.$queryRaw<SeriesResult[]>`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as orders,
          SUM(total_price) as revenue
        FROM "Order"
        WHERE created_at >= ${fromDate} 
          AND created_at <= ${toDate}
          AND tenant_id = ${tenantId}  -- CRITICAL: Tenant isolation
        GROUP BY DATE(created_at)
        ORDER BY date
      `,
      
      // Get top customers by spend - ADDED tenant_id filters
      prisma.$queryRaw<CustomerResult[]>`
        SELECT 
          c.id,
          c.first_name,
          c.last_name,
          c.email,
          SUM(o.total_price) as spend
        FROM "Customer" c
        JOIN "Order" o ON c.id = o.customer_id::integer
        WHERE o.created_at >= ${fromDate} 
          AND o.created_at <= ${toDate}
          AND o.tenant_id = ${tenantId}  -- CRITICAL: Tenant isolation
          AND c.tenant_id = ${tenantId}  -- CRITICAL: Tenant isolation
        GROUP BY c.id, c.first_name, c.last_name, c.email
        ORDER BY spend DESC
        LIMIT 5
      `,
      
      // Get total customer count - ADDED tenant_id filter
      prisma.customer.count({
        where: {
          tenant_id: tenantId  // CRITICAL: Tenant isolation
        }
      }),
      
      // Get total orders in date range - ADDED tenant_id filter
      prisma.order.count({
        where: {
          created_at: {
            gte: fromDate,
            lte: toDate
          },
          tenant_id: tenantId  // CRITICAL: Tenant isolation
        }
      }),
      
      // Get total revenue in date range - ADDED tenant_id filter
      prisma.order.aggregate({
        where: {
          created_at: {
            gte: fromDate,
            lte: toDate
          },
          tenant_id: tenantId  // CRITICAL: Tenant isolation
        },
        _sum: {
          total_price: true
        }
      })
    ]);

    // Process series data to fill in missing dates
    const processedSeries = processSeriesData(seriesData, fromDate, toDate);
    
    // Calculate average order value
    const revenueTotal = totalRevenue._sum?.total_price ?? 0;
    const avgOrderValue = totalOrders > 0 
      ? Number(revenueTotal) / totalOrders 
      : 0;

    return {
      series: processedSeries,
      topCustomers: topCustomers.map((customer) => ({
        id: customer.id.toString(),
        name: `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown Customer',
        email: customer.email || 'No email',
        spend: Number(customer.spend || 0)
      })),
      totals: {
        totalCustomers,
        totalOrders,
        totalRevenue: Number(revenueTotal),
        avgOrderValue
      }
    };
  } catch (error) {
    console.error("Error fetching business data:", error);
    throw new Error("Failed to fetch business data");
  }
}

function processSeriesData(seriesData: SeriesResult[], from: Date, to: Date) {
  const result = [];
  const currentDate = new Date(from);
  const endDate = new Date(to);
  
  // Create a map of existing data for easy lookup
  const dataMap = new Map();
  seriesData.forEach((item) => {
    const dateStr = item.date.toISOString().split('T')[0];
    dataMap.set(dateStr, {
      orders: Number(item.orders),
      revenue: Number(item.revenue || 0)
    });
  });
  
  // Generate data for all dates in the range
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const existingData = dataMap.get(dateStr);
    
    result.push({
      date: dateStr,
      orders: existingData ? existingData.orders : 0,
      revenue: existingData ? existingData.revenue : 0
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return result;
}

// Optional: Close Prisma connection on shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});