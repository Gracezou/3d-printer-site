import Decimal from 'decimal.js';
import { and, eq } from 'drizzle-orm';

import {
  materialStockMovements,
  materials,
  orderItems,
  refundItems,
  refunds,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import type { DbTransaction } from '@/lib/services/admin-log.service';
import { calculateRefundRestock } from '@/lib/services/refund-restock';

/** Must run in the same transaction that confirms the provider refund. */
export async function returnRefundItemStock(
  tx: DbTransaction,
  refundItemId: string,
  operatorId: string,
): Promise<string[]> {
  const [line] = await tx
    .select({
      refundOrderId: refunds.orderId,
      refundStatus: refunds.status,
      orderId: orderItems.orderId,
      quantity: refundItems.quantity,
      restock: refundItems.restock,
      bomSnapshot: orderItems.bomSnapshot,
    })
    .from(refundItems)
    .innerJoin(refunds, eq(refunds.id, refundItems.refundId))
    .innerJoin(orderItems, eq(orderItems.id, refundItems.orderItemId))
    .where(eq(refundItems.id, refundItemId))
    .limit(1);

  if (!line) throw new BizError('NOT_FOUND', '退款商品明细不存在');
  if (line.refundOrderId !== line.orderId) {
    throw new BizError('ORDER_STATUS_INVALID', '退款商品不属于该订单');
  }
  if (!line.restock) return [];
  if (line.refundStatus !== 'success') {
    throw new BizError('ORDER_STATUS_INVALID', '退款未成功，不能返还库存');
  }

  const restockMaterials = calculateRefundRestock(
    line.bomSnapshot,
    line.quantity,
  );
  const movementIds: string[] = [];

  for (const needed of restockMaterials) {
    // The helper sorts IDs so every concurrent refund takes material locks in one order.
    const [material] = await tx
      .select({
        id: materials.id,
        stockGrams: materials.stockGrams,
        reservedGrams: materials.reservedGrams,
      })
      .from(materials)
      .where(eq(materials.id, needed.materialId))
      .limit(1)
      .for('update');
    if (!material) throw new BizError('NOT_FOUND', '订单耗材已不存在');

    const [existing] = await tx
      .select({ id: materialStockMovements.id })
      .from(materialStockMovements)
      .where(
        and(
          eq(materialStockMovements.refType, 'refund_item'),
          eq(materialStockMovements.refId, refundItemId),
          eq(materialStockMovements.materialId, needed.materialId),
          eq(materialStockMovements.movementType, 'refund_return'),
        ),
      )
      .limit(1);
    if (existing) {
      movementIds.push(existing.id);
      continue;
    }

    const stockAfter = new Decimal(material.stockGrams)
      .plus(needed.grams)
      .toFixed(2);
    await tx
      .update(materials)
      .set({ stockGrams: stockAfter, updatedAt: new Date() })
      .where(eq(materials.id, material.id));
    const [movement] = await tx
      .insert(materialStockMovements)
      .values({
        materialId: material.id,
        movementType: 'refund_return',
        deltaStockGrams: needed.grams,
        deltaReservedGrams: '0.00',
        stockAfter,
        reservedAfter: material.reservedGrams,
        refType: 'refund_item',
        refId: refundItemId,
        operatorType: 'admin',
        operatorId,
      })
      .returning({ id: materialStockMovements.id });
    if (!movement) throw new BizError('INTERNAL_ERROR', '写入退款库存流水失败');
    movementIds.push(movement.id);
  }

  return movementIds;
}
