import { and, count, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import {
  orderItems,
  orders,
  payments,
  printJobs,
  shipments,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger, maskPhone } from '@/lib/logger';
import {
  customerOrderStatusLabels as orderStatusLabels,
  printStatusLabels,
} from '@/messages/zh-CN';
import type { DbTransaction } from '@/lib/services/admin-log.service';
import { releaseDiscount } from '@/lib/services/promotion.service';
import type { CustomerOrderListQuery } from '@/lib/validators/order';

function statusFilter(
  status: CustomerOrderListQuery['status'],
): SQL | undefined {
  if (status === 'all') return undefined;
  if (status === 'in_production') {
    return inArray(orders.status, [
      'paid',
      'in_production',
      'pending_shipment',
    ]);
  }
  if (status === 'cancelled') {
    return inArray(orders.status, ['cancelled', 'refunding', 'refunded']);
  }
  return eq(orders.status, status);
}

export async function listCustomerOrders(
  userId: string,
  query: CustomerOrderListQuery,
) {
  const db = getDb();
  const selectedStatus = statusFilter(query.status);
  const where = selectedStatus
    ? and(eq(orders.userId, userId), selectedStatus)
    : eq(orders.userId, userId);
  const offset = (query.page - 1) * query.pageSize;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        payableAmount: orders.payableAmount,
        paidAmount: orders.paidAmount,
        refundedAmount: orders.refundedAmount,
        reservedUntil: orders.reservedUntil,
        createdAt: orders.createdAt,
        paidAt: orders.paidAt,
        shippedAt: orders.shippedAt,
      })
      .from(orders)
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  const orderIds = rows.map((order) => order.id);
  const itemRows = orderIds.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          productName: orderItems.productName,
          variantName: orderItems.variantName,
          imageUrl: orderItems.imageUrl,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(inArray(orderItems.orderId, orderIds))
        .orderBy(orderItems.createdAt)
    : [];
  const itemsByOrder = new Map<string, typeof itemRows>();
  for (const item of itemRows) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }
  return {
    list: rows.map(({ id, ...order }) => ({
      ...order,
      statusText: orderStatusLabels[order.status] ?? order.status,
      items: (itemsByOrder.get(id) ?? []).map((item) => ({
        productName: item.productName,
        variantName: item.variantName,
        imageUrl: item.imageUrl,
        quantity: item.quantity,
      })),
    })),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getCustomerOrderDetail(userId: string, orderNo: string) {
  const db = getDb();
  const [order] = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      itemsAmount: orders.itemsAmount,
      discountAmount: orders.discountAmount,
      shippingAmount: orders.shippingAmount,
      payableAmount: orders.payableAmount,
      paidAmount: orders.paidAmount,
      refundedAmount: orders.refundedAmount,
      discountCode: orders.discountCode,
      receiverName: orders.receiverName,
      receiverPhone: orders.receiverPhone,
      receiverProvince: orders.receiverProvince,
      receiverCity: orders.receiverCity,
      receiverDistrict: orders.receiverDistrict,
      receiverDetail: orders.receiverDetail,
      buyerRemark: orders.buyerRemark,
      reservedUntil: orders.reservedUntil,
      paidAt: orders.paidAt,
      shippedAt: orders.shippedAt,
      completedAt: orders.completedAt,
      cancelledAt: orders.cancelledAt,
      cancelReason: orders.cancelReason,
      createdAt: orders.createdAt,
      updatedAt: orders.updatedAt,
    })
    .from(orders)
    .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, userId)))
    .limit(1);
  if (!order) throw new BizError('NOT_FOUND', '订单不存在');

  const [items, shipmentRows] = await Promise.all([
    db
      .select({
        id: orderItems.id,
        productName: orderItems.productName,
        variantName: orderItems.variantName,
        imageUrl: orderItems.imageUrl,
        unitPrice: orderItems.unitPrice,
        quantity: orderItems.quantity,
        subtotal: orderItems.subtotal,
        printStatus: printJobs.status,
        printerName: printJobs.printerName,
        printStartedAt: printJobs.startedAt,
        printFinishedAt: printJobs.finishedAt,
      })
      .from(orderItems)
      .leftJoin(printJobs, eq(printJobs.orderItemId, orderItems.id))
      .where(eq(orderItems.orderId, order.id))
      .orderBy(orderItems.createdAt),
    db
      .select({
        carrierCode: shipments.carrierCode,
        carrierName: shipments.carrierName,
        trackingNo: shipments.trackingNo,
        shippedAt: shipments.shippedAt,
      })
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .orderBy(desc(shipments.shippedAt))
      .limit(1),
  ]);

  return {
    orderNo: order.orderNo,
    status: order.status,
    itemsAmount: order.itemsAmount,
    discountAmount: order.discountAmount,
    shippingAmount: order.shippingAmount,
    payableAmount: order.payableAmount,
    paidAmount: order.paidAmount,
    refundedAmount: order.refundedAmount,
    discountCode: order.discountCode,
    buyerRemark: order.buyerRemark,
    reservedUntil: order.reservedUntil,
    paidAt: order.paidAt,
    shippedAt: order.shippedAt,
    completedAt: order.completedAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    statusText: orderStatusLabels[order.status] ?? order.status,
    receiver: {
      name: order.receiverName,
      phone: maskPhone(order.receiverPhone),
      address: [
        order.receiverProvince,
        order.receiverCity,
        order.receiverDistrict,
        order.receiverDetail,
      ].join(' '),
    },
    items: items.map((item) => ({
      ...item,
      printStatusText: item.printStatus
        ? (printStatusLabels[item.printStatus] ?? item.printStatus)
        : null,
    })),
    shipment: shipmentRows[0] ?? null,
  };
}

export async function cancelCustomerOrder(userId: string, orderNo: string) {
  const result = await getDb().transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(orders)
      .set({
        status: 'cancelled',
        cancelReason: 'user_cancel',
        cancelledAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(orders.orderNo, orderNo),
          eq(orders.userId, userId),
          eq(orders.status, 'pending_payment'),
        ),
      )
      .returning({ id: orders.id, orderNo: orders.orderNo });
    if (!updated) await throwCustomerOrderStatusError(tx, userId, orderNo);
    await tx.execute(sql`SELECT fn_release_order_stock(${updated.id}::uuid)`);
    await releaseDiscount(tx, updated.id);
    await tx
      .update(payments)
      .set({ status: 'closed', updatedAt: now })
      .where(
        and(
          eq(payments.orderId, updated.id),
          inArray(payments.status, ['created', 'pending']),
        ),
      );
    return updated;
  });
  logger.info({ orderNo: result.orderNo, userId }, 'Customer cancelled order');
  return result;
}

export async function confirmCustomerOrder(userId: string, orderNo: string) {
  const now = new Date();
  const [updated] = await getDb()
    .update(orders)
    .set({ status: 'completed', completedAt: now, updatedAt: now })
    .where(
      and(
        eq(orders.orderNo, orderNo),
        eq(orders.userId, userId),
        eq(orders.status, 'shipped'),
      ),
    )
    .returning({ orderNo: orders.orderNo, completedAt: orders.completedAt });
  if (!updated) {
    const db = getDb();
    await throwCustomerOrderStatusError(db, userId, orderNo);
  }
  logger.info({ orderNo, userId }, 'Customer confirmed delivery');
  return updated;
}

async function throwCustomerOrderStatusError(
  executor: ReturnType<typeof getDb> | DbTransaction,
  userId: string,
  orderNo: string,
): Promise<never> {
  const [order] = await executor
    .select({ status: orders.status })
    .from(orders)
    .where(and(eq(orders.orderNo, orderNo), eq(orders.userId, userId)))
    .limit(1);
  if (!order) throw new BizError('NOT_FOUND', '订单不存在');
  throw new BizError('ORDER_STATUS_INVALID', '当前订单状态不允许执行此操作');
}
