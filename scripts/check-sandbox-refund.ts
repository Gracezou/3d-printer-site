import assert from 'node:assert/strict';

import Decimal from 'decimal.js';
import { and, eq, inArray } from 'drizzle-orm';

import { assertAlipaySandboxGateway } from './assert-alipay-sandbox';
import { assertLocalDatabaseUrl } from './assert-local-database';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  materialStockMovements,
  orderItems,
  orders,
  payments,
  printJobs,
  refundItems,
  refunds,
} from '@/lib/db/schema';
import { AlipayPageProvider } from '@/lib/services/payment/alipay.provider';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
}

async function main(): Promise<void> {
  assertAlipaySandboxGateway(process.env.ALIPAY_GATEWAY);
  assertLocalDatabaseUrl();
  if (process.env.ENABLE_MOCK_PAYMENT !== 'false') {
    throw new Error(
      'ENABLE_MOCK_PAYMENT must be exactly false for sandbox checks',
    );
  }
  const orderNo = argument('order-no');
  if (!orderNo) {
    throw new Error(
      'Usage: pnpm sandbox:refund-check -- --order-no=<ORDER_NO> [--query-provider=<OUT_REFUND_NO>]',
    );
  }

  const db = getDb();
  const [order] = await db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      paidAmount: orders.paidAmount,
      refundedAmount: orders.refundedAmount,
    })
    .from(orders)
    .where(eq(orders.orderNo, orderNo))
    .limit(1);
  assert(order, `Order ${orderNo} was not found in the local database`);
  const [payment] = await db
    .select({
      provider: payments.provider,
      status: payments.status,
      outTradeNo: payments.outTradeNo,
      amount: payments.amount,
    })
    .from(payments)
    .where(eq(payments.orderId, order.id))
    .limit(1);
  assert(payment, 'Payment record is missing');
  assert.equal(payment.provider, 'alipay_page');
  assert.equal(payment.status, 'success');

  const refundRows = await db
    .select({
      id: refunds.id,
      outRefundNo: refunds.outRefundNo,
      amount: refunds.amount,
      status: refunds.status,
      needsManualReview: refunds.needsManualReview,
      providerConfirmedAt: refunds.providerConfirmedAt,
      createdAt: refunds.createdAt,
    })
    .from(refunds)
    .where(eq(refunds.orderId, order.id));
  assert(refundRows.length > 0, 'No refund records were found');
  const refundIds = refundRows.map((refund) => refund.id);
  const itemRows = await db
    .select({
      id: refundItems.id,
      refundId: refundItems.refundId,
      orderItemId: refundItems.orderItemId,
      quantity: refundItems.quantity,
      amount: refundItems.amount,
      restock: refundItems.restock,
    })
    .from(refundItems)
    .where(inArray(refundItems.refundId, refundIds));
  const itemIds = itemRows.map((item) => item.id);
  const movements = itemIds.length
    ? await db
        .select({
          refId: materialStockMovements.refId,
          materialId: materialStockMovements.materialId,
          deltaStockGrams: materialStockMovements.deltaStockGrams,
        })
        .from(materialStockMovements)
        .where(
          and(
            eq(materialStockMovements.refType, 'refund_item'),
            inArray(materialStockMovements.refId, itemIds),
          ),
        )
    : [];
  const purchasedItems = await db
    .select({ id: orderItems.id, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, order.id));
  const jobs = await db
    .select({
      orderItemId: printJobs.orderItemId,
      status: printJobs.status,
      quantity: printJobs.quantity,
    })
    .from(printJobs)
    .where(eq(printJobs.orderId, order.id));

  const headerTotal = refundRows.reduce(
    (sum, refund) => sum.plus(refund.amount),
    new Decimal(0),
  );
  const itemTotal = itemRows.reduce(
    (sum, item) => sum.plus(item.amount),
    new Decimal(0),
  );
  assert(refundRows.every((refund) => refund.status === 'success'));
  assert(refundRows.every((refund) => !refund.needsManualReview));
  for (const refund of refundRows) {
    const detailTotal = itemRows
      .filter((item) => item.refundId === refund.id)
      .reduce((sum, item) => sum.plus(item.amount), new Decimal(0));
    assert(
      detailTotal.eq(refund.amount),
      `Refund ${refund.outRefundNo} header/detail mismatch`,
    );
  }
  assert(headerTotal.eq(itemTotal), 'Refund headers and items do not balance');
  assert(
    headerTotal.eq(order.refundedAmount),
    'Order refunded_amount does not match refund headers',
  );
  assert(
    headerTotal.eq(order.paidAmount),
    'Final refund total does not equal paid amount',
  );
  assert(
    refundRows.length >= 2,
    'Expected at least a partial refund and a remaining refund',
  );
  for (const item of purchasedItems) {
    const refundedQuantity = itemRows
      .filter((refundItem) => refundItem.orderItemId === item.id)
      .reduce((sum, refundItem) => sum + refundItem.quantity, 0);
    const remaining = item.quantity - refundedQuantity;
    const queued = jobs.find(
      (job) => job.orderItemId === item.id && job.status === 'queued',
    );
    assert(remaining >= 0, `Order item ${item.id} was over-refunded`);
    assert(
      !queued || queued.quantity <= remaining,
      `Queued print quantity exceeds paid quantity for ${item.id}`,
    );
  }
  const movementKeys = new Set(
    movements.map((movement) => `${movement.refId}:${movement.materialId}`),
  );
  assert.equal(
    movementKeys.size,
    movements.length,
    'Duplicate refund-item stock movements found',
  );

  const queryOutRefundNo = argument('query-provider');
  let providerQuery: unknown = 'not requested';
  if (queryOutRefundNo) {
    const target = refundRows.find(
      (refund) => refund.outRefundNo === queryOutRefundNo,
    );
    assert(
      target,
      `Refund ${queryOutRefundNo} does not belong to order ${orderNo}`,
    );
    assert(
      Date.now() - target.createdAt.getTime() >= 10_000,
      'Wait at least 10 seconds after creating the refund before querying Alipay',
    );
    providerQuery = await new AlipayPageProvider().queryRefund({
      outTradeNo: payment.outTradeNo,
      outRefundNo: target.outRefundNo,
      amount: target.amount,
    });
    assert.deepEqual(
      providerQuery,
      expectProviderSuccess(target.outRefundNo),
      'Sandbox query did not confirm REFUND_SUCCESS with the expected amount',
    );
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        order,
        payment,
        refundHeaders: refundRows,
        refundItems: itemRows,
        refundItemStockMovements: movements,
        printJobs: jobs,
        totals: {
          paid: order.paidAmount,
          refundHeaders: headerTotal.toFixed(2),
          refundItems: itemTotal.toFixed(2),
        },
        providerQuery,
      },
      null,
      2,
    )}\n`,
  );
}

function expectProviderSuccess(outRefundNo: string) {
  return { status: 'success', providerRefundId: outRefundNo };
}

main()
  .catch((error: unknown) => {
    process.stderr.write(
      `Sandbox refund reconciliation failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(closeDatabaseConnection);
