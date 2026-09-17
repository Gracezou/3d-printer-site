import Decimal from 'decimal.js';

import { toFixed2 } from '@/lib/money';

export interface RefundAllocationItem {
  orderItemId: string;
  subtotal: string;
  quantity: number;
  refundedQuantity: number;
}

export interface RefundAllocationRequest {
  orderItemId: string;
  quantity: number;
}

export interface RefundAllocationInput {
  itemsAmount: string;
  discountAmount: string;
  shippingAmount: string;
  paidAmount: string;
  items: RefundAllocationItem[];
  requests: RefundAllocationRequest[];
}

export interface RefundAllocationLine {
  orderItemId: string;
  quantity: number;
  itemsAmount: string;
  discountShare: string;
  shippingShare: string;
  amount: string;
}

export interface RefundAllocationResult {
  lines: RefundAllocationLine[];
  amount: string;
  isFullRefund: boolean;
}

const ZERO = new Decimal(0);

export class ZeroRefundAmountError extends RangeError {}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function money(value: string): Decimal {
  const amount = new Decimal(value);
  if (!amount.isFinite() || amount.isNegative() || amount.decimalPlaces() > 2) {
    throw new RangeError('金额必须是非负且最多两位小数');
  }
  return amount;
}

function cumulativeShare(
  total: Decimal,
  denominator: Decimal.Value,
  numerator: Decimal.Value,
): Decimal {
  return total
    .mul(numerator)
    .div(denominator)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Deterministic cent allocation: each prefix is rounded once, the final prefix is exact. */
export function allocateRefund(
  input: RefundAllocationInput,
): RefundAllocationResult {
  if (input.items.length === 0 || input.requests.length === 0) {
    throw new RangeError('退款商品不能为空');
  }

  const itemsAmount = money(input.itemsAmount);
  const discountAmount = money(input.discountAmount);
  const shippingAmount = money(input.shippingAmount);
  const paidAmount = money(input.paidAmount);
  if (
    itemsAmount.lte(0) ||
    discountAmount.gt(itemsAmount) ||
    !itemsAmount.minus(discountAmount).plus(shippingAmount).eq(paidAmount)
  ) {
    throw new RangeError('订单金额不一致');
  }

  const sortedItems = [...input.items].sort((left, right) =>
    compareIds(left.orderItemId, right.orderItemId),
  );
  const itemById = new Map<string, RefundAllocationItem>();
  let subtotalSum = ZERO;
  for (const item of sortedItems) {
    if (
      itemById.has(item.orderItemId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isSafeInteger(item.refundedQuantity) ||
      item.refundedQuantity < 0 ||
      item.refundedQuantity > item.quantity
    ) {
      throw new RangeError('订单商品数量无效');
    }
    itemById.set(item.orderItemId, item);
    subtotalSum = subtotalSum.plus(money(item.subtotal));
  }
  if (!subtotalSum.eq(itemsAmount)) {
    throw new RangeError('订单商品金额与订单小计不一致');
  }

  const requestById = new Map<string, number>();
  for (const request of input.requests) {
    const item = itemById.get(request.orderItemId);
    if (
      !item ||
      requestById.has(request.orderItemId) ||
      !Number.isSafeInteger(request.quantity) ||
      request.quantity <= 0 ||
      request.quantity > item.quantity - item.refundedQuantity
    ) {
      throw new RangeError('退款数量超过商品可退数量');
    }
    requestById.set(request.orderItemId, request.quantity);
  }

  const isFullRefund = sortedItems.every(
    (item) =>
      item.refundedQuantity + (requestById.get(item.orderItemId) ?? 0) ===
      item.quantity,
  );
  const lines: RefundAllocationLine[] = [];
  let previousSubtotal = ZERO;
  let previousDiscount = ZERO;

  for (const item of sortedItems) {
    const subtotal = money(item.subtotal);
    const nextSubtotal = previousSubtotal.plus(subtotal);
    const nextDiscount = cumulativeShare(
      discountAmount,
      itemsAmount,
      nextSubtotal,
    );
    const itemDiscount = nextDiscount.minus(previousDiscount);
    previousSubtotal = nextSubtotal;
    previousDiscount = nextDiscount;

    const quantity = requestById.get(item.orderItemId);
    if (!quantity) continue;
    const refundedBefore = item.refundedQuantity;
    const refundedAfter = refundedBefore + quantity;
    const itemAmount = cumulativeShare(
      subtotal,
      item.quantity,
      refundedAfter,
    ).minus(cumulativeShare(subtotal, item.quantity, refundedBefore));
    const discountShare = cumulativeShare(
      itemDiscount,
      item.quantity,
      refundedAfter,
    ).minus(cumulativeShare(itemDiscount, item.quantity, refundedBefore));
    lines.push({
      orderItemId: item.orderItemId,
      quantity,
      itemsAmount: toFixed2(itemAmount),
      discountShare: toFixed2(discountShare),
      shippingShare: '0.00',
      amount: toFixed2(itemAmount.minus(discountShare)),
    });
  }

  if (isFullRefund) {
    const finalLine = lines.at(-1);
    if (!finalLine) throw new RangeError('退款商品不能为空');
    finalLine.shippingShare = toFixed2(shippingAmount);
    finalLine.amount = toFixed2(
      new Decimal(finalLine.amount).plus(shippingAmount),
    );
  }

  const amount = lines.reduce((sum, line) => sum.plus(line.amount), ZERO);
  if (amount.lte(0)) {
    throw new ZeroRefundAmountError('退款金额必须大于 0');
  }
  if (amount.gt(paidAmount)) {
    throw new RangeError('退款金额无效');
  }
  return { lines, amount: toFixed2(amount), isFullRefund };
}
