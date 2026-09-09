import { count, eq, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { materials, orders, payments, printJobs } from '@/lib/db/schema';

const shanghaiTodayStart = sql`(
  date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai')
  AT TIME ZONE 'Asia/Shanghai'
)`;

export async function getAdminDashboard() {
  const db = getDb();
  // Supabase transaction-mode poolers can stall when this page starts more
  // concurrent statements than the application's connection pool allows.
  // Keep these small dashboard queries sequential so the SSR request cannot
  // consume every pooled connection while another statement is queued.
  const todayOrders = await db
    .select({ total: count() })
    .from(orders)
    .where(sql`${orders.createdAt} >= ${shanghaiTodayStart}`);
  const todaySales = await db
    .select({
      amount:
        sql<string>`COALESCE(SUM(${orders.paidAmount}), 0)::numeric(10, 2)`.as(
          'today_sales_amount',
        ),
    })
    .from(orders)
    .where(sql`${orders.paidAt} >= ${shanghaiTodayStart}`);
  const pendingProduction = await db
    .select({ total: count() })
    .from(printJobs)
    .where(eq(printJobs.status, 'queued'));
  const pendingShipment = await db
    .select({ total: count() })
    .from(orders)
    .where(eq(orders.status, 'pending_shipment'));
  const reviewPayments = await db
    .select({ total: count() })
    .from(payments)
    .where(eq(payments.needsManualReview, true));
  const lowStockMaterials = await db
    .select({
      id: materials.id,
      code: materials.code,
      name: materials.name,
      colorHex: materials.colorHex,
      availableGrams:
        sql<string>`${materials.stockGrams} - ${materials.reservedGrams}`.as(
          'available_grams',
        ),
      safetyGrams: materials.safetyGrams,
    })
    .from(materials)
    .where(
      sql`${materials.stockGrams} - ${materials.reservedGrams} <= ${materials.safetyGrams}`,
    )
    .orderBy(
      sql`${materials.stockGrams} - ${materials.reservedGrams} - ${materials.safetyGrams}`,
      materials.name,
    );

  return {
    todayOrderCount: todayOrders[0]?.total ?? 0,
    todaySalesAmount: todaySales[0]?.amount ?? '0.00',
    pendingProductionCount: pendingProduction[0]?.total ?? 0,
    pendingShipmentCount: pendingShipment[0]?.total ?? 0,
    needsReviewPaymentCount: reviewPayments[0]?.total ?? 0,
    lowStockMaterials,
  };
}
