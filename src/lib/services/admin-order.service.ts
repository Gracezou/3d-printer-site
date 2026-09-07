import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm';
import Decimal from 'decimal.js';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import {
  orderItems,
  orders,
  payments,
  refunds,
  shipments,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { maskEmail } from '@/lib/logger';
import { toFixed2 } from '@/lib/money';
import { withAdminLog } from '@/lib/services/admin-log.service';
import { releaseDiscount } from '@/lib/services/promotion.service';
import type {
  AdminOrderListQuery,
  AdminOrderShipInput,
} from '@/lib/validators/admin-order';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

function dateAtStart(value: string): Date {
  return new Date(`${value}T00:00:00+08:00`);
}

function dateAtEnd(value: string): Date {
  return new Date(`${value}T23:59:59.999+08:00`);
}

function orderFilters(query: AdminOrderListQuery): SQL[] {
  const filters: SQL[] = [];
  if (query.status) filters.push(eq(orders.status, query.status));
  if (query.keyword) {
    const keyword = `%${query.keyword}%`;
    filters.push(
      or(ilike(orders.orderNo, keyword), ilike(orders.receiverPhone, keyword))!,
    );
  }
  if (query.startDate)
    filters.push(gte(orders.createdAt, dateAtStart(query.startDate)));
  if (query.endDate)
    filters.push(lte(orders.createdAt, dateAtEnd(query.endDate)));
  return filters;
}

export async function listAdminOrders(query: AdminOrderListQuery) {
  const db = getDb();
  const filters = orderFilters(query);
  const where = filters.length ? and(...filters) : undefined;
  const offset = (query.page - 1) * query.pageSize;
  const [list, totals] = await Promise.all([
    db
      .select({
        id: orders.id,
        orderNo: orders.orderNo,
        status: orders.status,
        userEmail: userProfiles.email,
        receiverName: orders.receiverName,
        receiverPhone: orders.receiverPhone,
        payableAmount: orders.payableAmount,
        paidAmount: orders.paidAmount,
        paidAt: orders.paidAt,
        shippedAt: orders.shippedAt,
        createdAt: orders.createdAt,
        itemCount:
          sql<number>`(SELECT COALESCE(sum(oi.quantity), 0)::int FROM ${orderItems} oi WHERE oi.order_id = ${orders.id})`.as(
            'item_count',
          ),
      })
      .from(orders)
      .innerJoin(userProfiles, eq(userProfiles.id, orders.userId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(query.pageSize)
      .offset(offset),
    db.select({ total: count() }).from(orders).where(where),
  ]);
  return {
    list: list.map((order) => ({
      ...order,
      userEmail: maskEmail(order.userEmail),
    })),
    total: totals[0]?.total ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function getAdminOrderDetail(orderId: string) {
  const db = getDb();
  const [order] = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      userId: orders.userId,
      userEmail: userProfiles.email,
      userNickname: userProfiles.nickname,
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
      adminRemark: orders.adminRemark,
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
    .innerJoin(userProfiles, eq(userProfiles.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order) throw new BizError('NOT_FOUND', '订单不存在');

  const [items, paymentRows, refundRows, shipmentRows] = await Promise.all([
    db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.createdAt),
    db
      .select({
        id: payments.id,
        outTradeNo: payments.outTradeNo,
        provider: payments.provider,
        providerTxnId: payments.providerTxnId,
        amount: payments.amount,
        currency: payments.currency,
        status: payments.status,
        needsManualReview: payments.needsManualReview,
        paidAt: payments.paidAt,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .orderBy(desc(payments.createdAt)),
    db
      .select({
        id: refunds.id,
        outRefundNo: refunds.outRefundNo,
        providerRefundId: refunds.providerRefundId,
        amount: refunds.amount,
        isFullRefund: refunds.isFullRefund,
        restock: refunds.restock,
        reason: refunds.reason,
        status: refunds.status,
        createdAt: refunds.createdAt,
        updatedAt: refunds.updatedAt,
      })
      .from(refunds)
      .where(eq(refunds.orderId, orderId))
      .orderBy(desc(refunds.createdAt)),
    db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, orderId))
      .orderBy(desc(shipments.shippedAt)),
  ]);
  return {
    ...order,
    userEmail: maskEmail(order.userEmail),
    refundableAmount: toFixed2(
      Decimal.max(
        new Decimal(order.paidAmount).minus(order.refundedAmount),
        new Decimal(0),
      ),
    ),
    items,
    payments: paymentRows,
    refunds: refundRows,
    shipments: shipmentRows,
  };
}

export async function updateAdminOrderRemark(
  orderId: string,
  remark: string | null,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const [updated] = await tx
        .update(orders)
        .set({ adminRemark: remark || null, updatedAt: new Date() })
        .where(eq(orders.id, orderId))
        .returning({ id: orders.id, adminRemark: orders.adminRemark });
      if (!updated) throw new BizError('NOT_FOUND', '订单不存在');
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.remark',
      targetType: 'order',
      targetId: orderId,
      payload: { remark },
      ip: context.ip,
    },
  );
}

export async function shipAdminOrder(
  orderId: string,
  input: AdminOrderShipInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(orders)
        .set({ status: 'shipped', shippedAt: now, updatedAt: now })
        .where(
          and(eq(orders.id, orderId), eq(orders.status, 'pending_shipment')),
        )
        .returning({ id: orders.id, orderNo: orders.orderNo });
      if (!updated) {
        const [existing] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);
        if (!existing) throw new BizError('NOT_FOUND', '订单不存在');
        throw new BizError('ORDER_STATUS_INVALID', '只有待发货订单可以发货');
      }
      const [shipment] = await tx
        .insert(shipments)
        .values({
          orderId,
          carrierCode: input.carrierCode,
          carrierName: input.carrierName,
          trackingNo: input.trackingNo,
          shippedAt: now,
          operatorId: context.admin.sub,
          remark: input.remark || null,
        })
        .returning();
      return { order: updated, shipment };
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.ship',
      targetType: 'order',
      targetId: orderId,
      payload: {
        carrierCode: input.carrierCode,
        carrierName: input.carrierName,
        trackingNo: input.trackingNo,
      },
      ip: context.ip,
    },
  );
}

export async function cancelAdminOrder(orderId: string, context: WriteContext) {
  return withAdminLog(
    async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(orders)
        .set({
          status: 'cancelled',
          cancelReason: 'admin_cancel',
          cancelledAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(orders.id, orderId), eq(orders.status, 'pending_payment')),
        )
        .returning({ id: orders.id, orderNo: orders.orderNo });
      if (!updated) {
        const [existing] = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(eq(orders.id, orderId))
          .limit(1);
        if (!existing) throw new BizError('NOT_FOUND', '订单不存在');
        throw new BizError('ORDER_STATUS_INVALID', '只有待支付订单可以取消');
      }
      await tx.execute(sql`SELECT fn_release_order_stock(${orderId}::uuid)`);
      await releaseDiscount(tx, orderId);
      return updated;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'order.cancel',
      targetType: 'order',
      targetId: orderId,
      payload: { reason: 'admin_cancel' },
      ip: context.ip,
    },
  );
}

function csvCell(value: unknown): string {
  const raw = value instanceof Date ? value.toISOString() : String(value ?? '');
  const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function exportAdminOrders(
  query: AdminOrderListQuery,
): Promise<string> {
  const firstPage = await listAdminOrders({ ...query, page: 1, pageSize: 100 });
  const allOrders = [...firstPage.list];
  const totalPages = Math.ceil(firstPage.total / 100);
  for (let page = 2; page <= totalPages; page += 1) {
    const nextPage = await listAdminOrders({
      ...query,
      page,
      pageSize: 100,
    });
    allOrders.push(...nextPage.list);
  }
  const header = [
    '订单号',
    '状态',
    '用户邮箱',
    '收货人',
    '收货手机号',
    '商品数量',
    '应付金额',
    '实付金额',
    '下单时间',
    '支付时间',
    '发货时间',
  ];
  const rows = allOrders.map((order) => [
    order.orderNo,
    order.status,
    order.userEmail,
    order.receiverName,
    order.receiverPhone,
    order.itemCount,
    order.payableAmount,
    order.paidAmount,
    order.createdAt,
    order.paidAt,
    order.shippedAt,
  ]);
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
