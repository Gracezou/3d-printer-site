import assert from 'node:assert/strict';

import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  adminOperationLogs,
  adminRoles,
  adminUsers,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  payments,
  printJobs,
  refundItems,
  refunds,
  returnRequestItems,
  returnRequests,
  settings,
  userProfiles,
} from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import type { PaymentProvider } from '@/lib/services/payment/provider.interface';
import { cleanupOrphanReturnEvidence } from '@/lib/services/cron.service';
import {
  refundOrder,
  resumeRefund,
  voidRefundAfterManualVerification,
} from '@/lib/services/refund.service';
import {
  approveReturnRequest,
  cancelCustomerReturnRequest,
  createReturnRequest,
  getCustomerReturnRequest,
  listAdminReturnRequests,
  listCustomerReturnRequests,
  rejectReturnRequest,
} from '@/lib/services/return-request.service';
import {
  DEFAULT_RETURN_RULES,
  RETURN_RULES_SETTING_KEY,
} from '@/lib/services/return-policy';
import { assertLocalDatabaseUrl } from './assert-local-database';

function provider(
  options: {
    delayMs?: number;
    unknown?: boolean;
    rejected?: boolean;
    queryStatus?: 'not_found' | 'pending' | 'success';
    queryThrows?: boolean;
    beforeRefund?: () => Promise<void>;
  } = {},
) {
  let refundCalls = 0;
  const value: PaymentProvider = {
    code: 'mock',
    async createPayment() {
      return { payUrl: 'http://localhost/mock' };
    },
    async queryPayment() {
      return { status: 'success' as const };
    },
    async verifyNotify() {
      return { valid: false, raw: {} };
    },
    async refund({ outRefundNo }) {
      refundCalls += 1;
      await options.beforeRefund?.();
      if (options.delayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
      if (options.unknown) {
        return { status: 'unknown' as const, message: '模拟渠道结果未知' };
      }
      if (options.rejected) {
        return {
          status: 'rejected' as const,
          message: 'ACQ.REASON_TRADE_REFUND_FEE_ERR: 内部渠道说明',
        };
      }
      return {
        status: 'success' as const,
        providerRefundId: `MOCK-${outRefundNo}`,
      };
    },
    async queryRefund({ outRefundNo }) {
      if (options.queryThrows) throw new Error('模拟渠道查询超时及内部参数');
      const status =
        options.queryStatus ?? (options.unknown ? 'pending' : 'not_found');
      return status === 'success'
        ? {
            status: 'success' as const,
            providerRefundId: `MOCK-${outRefundNo}`,
          }
        : { status };
    },
  };
  return { value, calls: () => refundCalls };
}

async function expectCode(operation: () => Promise<unknown>, code: number) {
  await assert.rejects(operation, (error: unknown) => {
    assert(error instanceof BizError);
    assert.equal(error.code, code);
    return true;
  });
}

async function main(): Promise<void> {
  assertLocalDatabaseUrl();
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const userA = crypto.randomUUID();
  const userB = crypto.randomUUID();
  const orderIds: string[] = [];
  const previousSupabaseUrl = process.env.SUPABASE_URL;
  const previousStorageBucket = process.env.SUPABASE_STORAGE_BUCKET;
  process.env.SUPABASE_URL = 'https://b3-storage.example.test';
  process.env.SUPABASE_STORAGE_BUCKET = 'products';
  const [previousRules] = await db
    .select({ value: settings.value, remark: settings.remark })
    .from(settings)
    .where(eq(settings.key, RETURN_RULES_SETTING_KEY))
    .limit(1);
  let materialId: string | undefined;
  let adminId: string | undefined;
  let roleId: string | undefined;

  try {
    await db.insert(userProfiles).values([
      { id: userA, email: `b3-a-${suffix}@example.test` },
      { id: userB, email: `b3-b-${suffix}@example.test` },
    ]);
    const [role] = await db
      .insert(adminRoles)
      .values({
        code: `b3-review-${suffix}`,
        name: 'B3 售后审核测试',
        permissions: ['return:review', 'order:refund'],
      })
      .returning({ id: adminRoles.id });
    assert(role);
    roleId = role.id;
    const [adminRow] = await db
      .insert(adminUsers)
      .values({
        username: `b3-review-${suffix}`,
        passwordHash: 'integration-test-only',
        name: 'B3 审核员',
        roleId: role.id,
      })
      .returning({ id: adminUsers.id });
    assert(adminRow);
    adminId = adminRow.id;
    const admin: AdminIdentity = {
      sub: adminRow.id,
      username: `b3-review-${suffix}`,
      name: 'B3 审核员',
      roleCode: `b3-review-${suffix}`,
      permissions: ['return:review', 'order:refund'],
    };
    const context = { admin, ip: '127.0.0.1' };
    const [material] = await db
      .insert(materials)
      .values({
        code: `B3-${suffix}`,
        name: `B3 售后耗材 ${suffix}`,
        materialType: 'PLA',
        stockGrams: '100.00',
        reservedGrams: '0.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id, name: materials.name });
    assert(material);
    materialId = material.id;

    async function createOrder(
      tag: string,
      userId: string,
      printStatus: string,
      status = printStatus === 'done' ? 'completed' : 'paid',
    ) {
      const [order] = await db
        .insert(orders)
        .values({
          orderNo: `B3${tag}${suffix}`.slice(0, 32),
          userId,
          status,
          itemsAmount: '20.00',
          payableAmount: '20.00',
          paidAmount: '20.00',
          receiverName: 'B3 测试用户',
          receiverPhone: '13800138000',
          receiverProvince: '广东省',
          receiverCity: '深圳市',
          receiverDistrict: '南山区',
          receiverDetail: '测试路 3 号',
          paidAt: new Date(),
          ...(status === 'completed' ? { completedAt: new Date() } : {}),
        })
        .returning({ id: orders.id, orderNo: orders.orderNo });
      assert(order);
      orderIds.push(order.id);
      const [item] = await db
        .insert(orderItems)
        .values({
          orderId: order.id,
          productName: `B3 商品 ${tag}`,
          variantName: '标准款',
          skuCode: `B3-${tag}-${suffix}`,
          unitPrice: '20.00',
          quantity: 1,
          subtotal: '20.00',
          bomSnapshot: [
            {
              material_id: material.id,
              material_name: material.name,
              grams: '10.00',
              waste_rate: '0.0000',
              required_grams: '10.00',
            },
          ],
        })
        .returning({ id: orderItems.id });
      assert(item);
      const [job] = await db
        .insert(printJobs)
        .values({
          orderId: order.id,
          orderItemId: item.id,
          quantity: 1,
          status: printStatus,
        })
        .returning({ id: printJobs.id });
      assert(job);
      await db.insert(payments).values({
        orderId: order.id,
        outTradeNo: `B3-${tag}-${suffix}`,
        provider: 'mock',
        amount: '20.00',
        status: 'success',
        paidAt: new Date(),
      });
      return { order, item, job };
    }

    const printing = await createOrder('PRINT', userA, 'printing');
    await expectCode(
      () =>
        createReturnRequest(userB, {
          orderNo: printing.order.orderNo,
          reasonCode: 'quality_issue',
          reasonText: '其他客户不能对不属于自己的订单发起申请',
          images: [],
          items: [{ orderItemId: printing.item.id, quantity: 1 }],
        }),
      40401,
    );
    await expectCode(
      () =>
        createReturnRequest(userA, {
          orderNo: printing.order.orderNo,
          reasonCode: 'quality_issue',
          reasonText: '普通原因不能越过 printing',
          images: [],
          items: [{ orderItemId: printing.item.id, quantity: 1 }],
        }),
      40916,
    );
    await db
      .insert(settings)
      .values({
        key: RETURN_RULES_SETTING_KEY,
        value: {
          ...DEFAULT_RETURN_RULES,
          ordinaryAllowedPrintStatuses: ['queued', 'printing'],
        },
        remark: 'B3 integration override',
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: {
            ...DEFAULT_RETURN_RULES,
            ordinaryAllowedPrintStatuses: ['queued', 'printing'],
          },
          updatedAt: new Date(),
        },
      });
    const configurable = await createReturnRequest(userA, {
      orderNo: printing.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '配置允许 printing 后无需改代码即可提交',
      images: [],
      items: [{ orderItemId: printing.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        createReturnRequest(userA, {
          orderNo: printing.order.orderNo,
          reasonCode: 'other',
          reasonText: '重复申请',
          images: [],
          items: [{ orderItemId: printing.item.id, quantity: 1 }],
        }),
      40915,
    );
    await expectCode(
      () => getCustomerReturnRequest(userB, configurable.requestNo),
      40401,
    );
    await expectCode(
      () => cancelCustomerReturnRequest(userB, configurable.requestNo),
      40401,
    );
    assert.equal(
      (await getCustomerReturnRequest(userA, configurable.requestNo)).status,
      'pending',
    );
    await cancelCustomerReturnRequest(userA, configurable.requestNo);
    await expectCode(
      () =>
        approveReturnRequest(
          configurable.id,
          {
            items: [{ orderItemId: printing.item.id, restock: false }],
          },
          context,
          { refund: { getProvider: () => provider().value } },
        ),
      40917,
    );
    if (previousRules) {
      await db
        .update(settings)
        .set({
          value: previousRules.value,
          remark: previousRules.remark,
          updatedAt: new Date(),
        })
        .where(eq(settings.key, RETURN_RULES_SETTING_KEY));
    } else {
      await db
        .delete(settings)
        .where(eq(settings.key, RETURN_RULES_SETTING_KEY));
    }

    const done = await createOrder('DONE', userA, 'done');
    const doneRequest = await createReturnRequest(userA, {
      orderNo: done.order.orderNo,
      reasonCode: 'size_mismatch',
      reasonText: '成品尺寸与模型标注不符',
      images: [],
      items: [{ orderItemId: done.item.id, quantity: 1 }],
    });
    const doneProvider = provider();
    await approveReturnRequest(
      doneRequest.id,
      { items: [{ orderItemId: done.item.id, restock: false }] },
      context,
      { refund: { getProvider: () => doneProvider.value } },
    );
    assert.equal(
      (await getCustomerReturnRequest(userA, doneRequest.requestNo)).status,
      'completed',
    );
    assert.equal(doneProvider.calls(), 1);

    const changedStatus = await createOrder('STATUS', userA, 'queued');
    const changedStatusRequest = await createReturnRequest(userA, {
      orderNo: changedStatus.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '申请后开始打印仍由运营决定是否批准',
      images: [],
      items: [{ orderItemId: changedStatus.item.id, quantity: 1 }],
    });
    await db
      .update(printJobs)
      .set({ status: 'printing' })
      .where(eq(printJobs.id, changedStatus.job.id));
    await approveReturnRequest(
      changedStatusRequest.id,
      { items: [{ orderItemId: changedStatus.item.id, restock: false }] },
      context,
      { refund: { getProvider: () => provider().value } },
    );
    assert.equal(
      (await getCustomerReturnRequest(userA, changedStatusRequest.requestNo))
        .status,
      'completed',
    );

    const direct = await createOrder('DIRECT', userA, 'queued');
    const applied = await createOrder('APPLY', userA, 'queued');
    const stockBeforeApplication = (
      await db
        .select({ stock: materials.stockGrams })
        .from(materials)
        .where(eq(materials.id, material.id))
    )[0]!.stock;
    const refundsBeforeApplication = (
      await db.select({ id: refunds.id }).from(refunds)
    ).length;
    const application = await createReturnRequest(userA, {
      orderNo: applied.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '审核通过后复用退款引擎',
      images: [],
      items: [{ orderItemId: applied.item.id, quantity: 1 }],
    });
    assert.equal(
      (
        await db
          .select({ stock: materials.stockGrams })
          .from(materials)
          .where(eq(materials.id, material.id))
      )[0]!.stock,
      stockBeforeApplication,
      'creating an application must not mutate stock',
    );
    assert.equal(
      (await db.select({ id: refunds.id }).from(refunds)).length,
      refundsBeforeApplication,
      'creating an application must not create a refund',
    );
    const directProvider = provider();
    const directResult = await refundOrder(
      direct.order.id,
      {
        idempotencyKey: `b3:direct:${suffix}`,
        reason: '审核通过后复用退款引擎',
        items: [{ orderItemId: direct.item.id, quantity: 1, restock: true }],
      },
      context,
      { getProvider: () => directProvider.value },
    );
    const applicationProvider = provider();
    const applicationResult = await approveReturnRequest(
      application.id,
      { items: [{ orderItemId: applied.item.id, restock: true }] },
      context,
      { refund: { getProvider: () => applicationProvider.value } },
    );
    assert.equal(applicationResult.amount, directResult.amount);
    assert.deepEqual(
      applicationResult.items.map((item) => ({
        quantity: item.quantity,
        itemsAmount: item.itemsAmount,
        discountShare: item.discountShare,
        shippingShare: item.shippingShare,
        amount: item.amount,
        restock: item.restock,
      })),
      directResult.items.map((item) => ({
        quantity: item.quantity,
        itemsAmount: item.itemsAmount,
        discountShare: item.discountShare,
        shippingShare: item.shippingShare,
        amount: item.amount,
        restock: item.restock,
      })),
      'direct and reviewed refunds must persist identical line accounting',
    );
    for (const result of [directResult, applicationResult]) {
      const movementRows = await db
        .select({ id: materialStockMovements.id })
        .from(materialStockMovements)
        .where(
          and(
            eq(materialStockMovements.refType, 'refund_item'),
            inArray(
              materialStockMovements.refId,
              result.items.map((item) => item.id),
            ),
          ),
        );
      assert.equal(movementRows.length, 1);
    }
    const auditShape = async (orderId: string) =>
      (
        await db
          .select({
            action: adminOperationLogs.action,
            payload: adminOperationLogs.payload,
          })
          .from(adminOperationLogs)
          .where(
            and(
              eq(adminOperationLogs.targetType, 'order'),
              eq(adminOperationLogs.targetId, orderId),
              inArray(adminOperationLogs.action, [
                'order.refund.request',
                'order.refund.success',
              ]),
            ),
          )
          .orderBy(adminOperationLogs.createdAt)
      ).map((log) => ({
        action: log.action,
        amount: log.payload?.amount,
        isFullRefund: log.payload?.isFullRefund,
        items: Array.isArray(log.payload?.items)
          ? log.payload.items.map((item: Record<string, unknown>) => ({
              quantity: item.quantity,
              amount: item.amount,
              restock: item.restock,
              printJobStatus: item.printJobStatus,
            }))
          : [],
      }));
    assert.deepEqual(
      await auditShape(applied.order.id),
      await auditShape(direct.order.id),
      'direct and reviewed refunds must emit equivalent refund audit entries',
    );

    const concurrent = await createOrder('CONCUR', userA, 'queued');
    const concurrentRequest = await createReturnRequest(userA, {
      orderNo: concurrent.order.orderNo,
      reasonCode: 'other',
      reasonText: '并发审核只能触发一次退款',
      images: [],
      items: [{ orderItemId: concurrent.item.id, quantity: 1 }],
    });
    const slowProvider = provider({ delayMs: 40 });
    const approvals = await Promise.allSettled([
      approveReturnRequest(
        concurrentRequest.id,
        { items: [{ orderItemId: concurrent.item.id, restock: false }] },
        context,
        { refund: { getProvider: () => slowProvider.value } },
      ),
      approveReturnRequest(
        concurrentRequest.id,
        { items: [{ orderItemId: concurrent.item.id, restock: false }] },
        context,
        { refund: { getProvider: () => slowProvider.value } },
      ),
    ]);
    assert.equal(
      approvals.filter((result) => result.status === 'fulfilled').length,
      1,
    );
    assert.equal(
      approvals.filter((result) => result.status === 'rejected').length,
      1,
    );
    assert.equal(slowProvider.calls(), 1);

    const unknown = await createOrder('UNKNOWN', userA, 'queued');
    const unknownProvider = provider({ unknown: true });
    await expectCode(
      () =>
        refundOrder(
          unknown.order.id,
          {
            idempotencyKey: `b3:unknown:${suffix}`,
            reason: '模拟渠道结果未知',
            items: [
              { orderItemId: unknown.item.id, quantity: 1, restock: false },
            ],
          },
          context,
          { getProvider: () => unknownProvider.value },
        ),
      50001,
    );
    const [unknownRefund] = await db
      .select({
        id: refunds.id,
        processingUntil: refunds.processingUntil,
      })
      .from(refunds)
      .where(eq(refunds.orderId, unknown.order.id));
    assert(unknownRefund);
    assert(
      unknownRefund.processingUntil &&
        unknownRefund.processingUntil > new Date(),
      'unknown refund must retain a cooldown lease before manual operations',
    );
    await expectCode(
      () =>
        voidRefundAfterManualVerification(
          unknownRefund.id,
          '未知结果后冷却期内不得作废',
          context,
          { getProvider: () => provider({ queryStatus: 'not_found' }).value },
        ),
      40920,
    );
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, unknownRefund.id));
    const voided = await voidRefundAfterManualVerification(
      unknownRefund.id,
      '支付宝商家中心与资金账单均确认未出款',
      context,
      { getProvider: () => provider().value },
    );
    assert.equal(voided.status, 'failed');
    assert.equal(voided.orderStatus, 'paid');
    assert.equal(
      (
        await db
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, unknown.order.id))
      )[0]!.status,
      'paid',
    );

    const confirmed = await createOrder('CONFIRM', userA, 'queued');
    await db
      .update(orders)
      .set({ status: 'refunding' })
      .where(eq(orders.id, confirmed.order.id));
    const [confirmedRefund] = await db
      .insert(refunds)
      .values({
        orderId: confirmed.order.id,
        paymentId: (
          await db
            .select({ id: payments.id })
            .from(payments)
            .where(eq(payments.orderId, confirmed.order.id))
        )[0]!.id,
        outRefundNo: `B3-CONFIRMED-${suffix}`,
        idempotencyKey: `b3:confirmed:${suffix}`,
        providerConfirmedAt: new Date(),
        needsManualReview: true,
        previousOrderStatus: 'paid',
        amount: '1.00',
        isFullRefund: false,
        reason: '渠道已确认',
      })
      .returning({ id: refunds.id });
    assert(confirmedRefund);
    await expectCode(
      () =>
        voidRefundAfterManualVerification(
          confirmedRefund.id,
          '不得作废已确认退款',
          context,
        ),
      40917,
    );

    const customerList = await listCustomerReturnRequests(userA, {
      page: 1,
      pageSize: 50,
    });
    assert.equal(customerList.total, 5);
    const queue = await listAdminReturnRequests({ page: 1, pageSize: 50 });
    assert(queue.list.some((request) => request.id === doneRequest.id));

    const evidence = await createOrder('EVIDENCE', userA, 'queued');
    const otherUserEvidence = `https://b3-storage.example.test/storage/v1/object/public/products/returns/${userB}/2026/09/other.png`;
    for (const image of [
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      `https://evil.example/returns/${userA}/evidence.png`,
      otherUserEvidence,
    ]) {
      await expectCode(
        () =>
          createReturnRequest(userA, {
            orderNo: evidence.order.orderNo,
            reasonCode: 'quality_issue',
            reasonText: '非法凭证地址必须在服务端拒绝',
            images: [image],
            items: [{ orderItemId: evidence.item.id, quantity: 1 }],
          }),
        40001,
      );
    }
    const storedEvidencePath = `returns/${userA}/2026/09/${crypto.randomUUID()}.png`;
    const storedEvidenceUrl = `https://b3-storage.example.test/storage/v1/object/public/products/${storedEvidencePath}`;
    const evidenceRequest = await createReturnRequest(userA, {
      orderNo: evidence.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '凭证应以稳定对象路径持久化',
      images: [storedEvidenceUrl],
      items: [{ orderItemId: evidence.item.id, quantity: 1 }],
    });
    const [storedEvidence] = await db
      .select({ images: returnRequests.images })
      .from(returnRequests)
      .where(eq(returnRequests.id, evidenceRequest.id));
    assert.deepEqual(storedEvidence?.images, [storedEvidencePath]);
    assert.deepEqual(
      (await getCustomerReturnRequest(userA, evidenceRequest.requestNo)).images,
      [storedEvidenceUrl],
    );

    const longReason = await createOrder('LONG', userA, 'queued');
    const longRequest = await createReturnRequest(userA, {
      orderNo: longReason.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: 'x'.repeat(500),
      images: [],
      items: [{ orderItemId: longReason.item.id, quantity: 1 }],
    });
    await approveReturnRequest(
      longRequest.id,
      {
        reviewRemark: '内部审核说明不得展示给客户',
        items: [{ orderItemId: longReason.item.id, restock: false }],
      },
      context,
      { refund: { getProvider: () => provider().value } },
    );
    const [longRefund] = await db
      .select({ reason: refunds.reason })
      .from(refunds)
      .where(eq(refunds.orderId, longReason.order.id));
    assert.equal(longRefund?.reason, `售后申请 ${longRequest.requestNo}`);
    const longCustomerView = await getCustomerReturnRequest(
      userA,
      longRequest.requestNo,
    );
    assert.equal(longCustomerView.status, 'completed');
    assert.equal(
      longCustomerView.reviewRemark,
      '退款已完成，请留意原支付渠道到账情况',
    );

    const internalReject = await createOrder('INTREJECT', userA, 'queued');
    const internalRejectRequest = await createReturnRequest(userA, {
      orderNo: internalReject.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '客户不应看到运营驳回原因',
      images: [],
      items: [{ orderItemId: internalReject.item.id, quantity: 1 }],
    });
    await rejectReturnRequest(
      internalRejectRequest.id,
      '内部驳回说明不得展示给客户',
      context,
    );
    assert.equal(
      (await getCustomerReturnRequest(userA, internalRejectRequest.requestNo))
        .reviewRemark,
      '申请未通过审核，请联系客户服务了解详情',
    );

    const recovery = await createOrder('RECOVERY', userA, 'queued');
    const recoveryRequest = await createReturnRequest(userA, {
      orderNo: recovery.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '渠道未知后必须使用原退款号续记',
      images: [],
      items: [{ orderItemId: recovery.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        approveReturnRequest(
          recoveryRequest.id,
          { items: [{ orderItemId: recovery.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider({ unknown: true }).value } },
        ),
      50001,
    );
    const recoveryPending = await getCustomerReturnRequest(
      userA,
      recoveryRequest.requestNo,
    );
    assert.equal(recoveryPending.status, 'approved');
    assert.equal(recoveryPending.reviewRemark, '退款结果待确认，正在人工复核');
    assert(recoveryPending.refundId);
    await expectCode(
      () =>
        createReturnRequest(userA, {
          orderNo: recovery.order.orderNo,
          reasonCode: 'other',
          reasonText: 'approved 未结案时不得重复申请',
          images: [],
          items: [{ orderItemId: recovery.item.id, quantity: 1 }],
        }),
      40915,
    );
    await expectCode(
      () => resumeRefund(recoveryPending.refundId!, context),
      40920,
    );
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, recoveryPending.refundId));
    let signalRefundStarted!: () => void;
    const refundStarted = new Promise<void>((resolve) => {
      signalRefundStarted = resolve;
    });
    let releaseRefund!: () => void;
    const refundGate = new Promise<void>((resolve) => {
      releaseRefund = resolve;
    });
    const resumeProvider = provider({
      queryStatus: 'not_found',
      beforeRefund: async () => {
        signalRefundStarted();
        await refundGate;
      },
    });
    const resume = resumeRefund(recoveryPending.refundId, context, {
      getProvider: () => resumeProvider.value,
    });
    await refundStarted;
    await expectCode(
      () =>
        voidRefundAfterManualVerification(
          recoveryPending.refundId!,
          '并发续记期间不允许作废',
          context,
          { getProvider: () => provider().value },
        ),
      40920,
    );
    releaseRefund();
    await resume;
    assert.equal(
      (await getCustomerReturnRequest(userA, recoveryRequest.requestNo)).status,
      'completed',
    );

    const rollback = await createOrder('ROLLBACK', userA, 'queued');
    const rollbackRequest = await createReturnRequest(userA, {
      orderNo: rollback.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '建单前失败应恢复待审核',
      images: [],
      items: [{ orderItemId: rollback.item.id, quantity: 1 }],
    });
    await db
      .update(orders)
      .set({ status: 'cancelled' })
      .where(eq(orders.id, rollback.order.id));
    await expectCode(
      () =>
        approveReturnRequest(
          rollbackRequest.id,
          { items: [{ orderItemId: rollback.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider().value } },
        ),
      40903,
    );
    const [rolledBackRequest] = await db
      .select({
        status: returnRequests.status,
        reviewerId: returnRequests.reviewerId,
        reviewRemark: returnRequests.reviewRemark,
      })
      .from(returnRequests)
      .where(eq(returnRequests.id, rollbackRequest.id));
    assert.equal(rolledBackRequest?.status, 'pending');
    assert.equal(rolledBackRequest?.reviewerId, null);
    assert.equal(
      rolledBackRequest?.reviewRemark,
      '退款尚未发起，请等待重新审核',
    );
    assert.equal(
      (
        await db
          .select({ id: adminOperationLogs.id })
          .from(adminOperationLogs)
          .where(
            and(
              eq(adminOperationLogs.targetId, rollbackRequest.id),
              eq(adminOperationLogs.action, 'return.review.refund_error'),
            ),
          )
      ).length,
      1,
    );

    const rejected = await createOrder('REJECTED', userA, 'queued');
    const rejectedRequest = await createReturnRequest(userA, {
      orderNo: rejected.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '渠道首次明确拒绝',
      images: [],
      items: [{ orderItemId: rejected.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        approveReturnRequest(
          rejectedRequest.id,
          { items: [{ orderItemId: rejected.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider({ rejected: true }).value } },
        ),
      40922,
    );
    const rejectedView = await getCustomerReturnRequest(
      userA,
      rejectedRequest.requestNo,
    );
    assert.equal(rejectedView.status, 'rejected');
    assert.equal(
      rejectedView.reviewRemark,
      '退款未获支付渠道受理，本次申请已结束',
    );
    assert(!rejectedView.reviewRemark?.includes('ACQ.'));

    const linkedVoid = await createOrder('LINKVOID', userA, 'queued');
    const linkedVoidRequest = await createReturnRequest(userA, {
      orderNo: linkedVoid.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '作废必须联动申请状态',
      images: [],
      items: [{ orderItemId: linkedVoid.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        approveReturnRequest(
          linkedVoidRequest.id,
          { items: [{ orderItemId: linkedVoid.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider({ unknown: true }).value } },
        ),
      50001,
    );
    const linkedVoidPending = await getCustomerReturnRequest(
      userA,
      linkedVoidRequest.requestNo,
    );
    assert(linkedVoidPending.refundId);
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, linkedVoidPending.refundId));
    await voidRefundAfterManualVerification(
      linkedVoidPending.refundId,
      '管理员内部核实结论不得展示给客户',
      context,
      { getProvider: () => provider({ queryStatus: 'not_found' }).value },
    );
    const linkedVoidView = await getCustomerReturnRequest(
      userA,
      linkedVoidRequest.requestNo,
    );
    assert.equal(linkedVoidView.status, 'rejected');
    assert.equal(
      linkedVoidView.reviewRemark,
      '经核实渠道未出款，本次售后申请已结束',
    );
    assert(!linkedVoidView.reviewRemark?.includes('内部核实'));
    const internalReviewQueue = await listAdminReturnRequests({
      page: 1,
      pageSize: 100,
    });
    assert(
      internalReviewQueue.list
        .find((request) => request.id === longRequest.id)
        ?.internalNotes.some(
          (note) => note.note === '内部审核说明不得展示给客户',
        ),
    );
    assert(
      internalReviewQueue.list
        .find((request) => request.id === internalRejectRequest.id)
        ?.internalNotes.some(
          (note) => note.note === '内部驳回说明不得展示给客户',
        ),
    );
    assert(
      internalReviewQueue.list
        .find((request) => request.id === linkedVoidRequest.id)
        ?.internalNotes.some(
          (note) => note.note === '管理员内部核实结论不得展示给客户',
        ),
    );

    const querySuccess = await createOrder('QUERYSUCC', userA, 'queued');
    const querySuccessRequest = await createReturnRequest(userA, {
      orderNo: querySuccess.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '渠道查询成功时必须续记而非作废',
      images: [],
      items: [{ orderItemId: querySuccess.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        approveReturnRequest(
          querySuccessRequest.id,
          { items: [{ orderItemId: querySuccess.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider({ unknown: true }).value } },
        ),
      50001,
    );
    const querySuccessPending = await getCustomerReturnRequest(
      userA,
      querySuccessRequest.requestNo,
    );
    assert(querySuccessPending.refundId);
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, querySuccessPending.refundId));
    const continued = await voidRefundAfterManualVerification(
      querySuccessPending.refundId,
      '查询确认成功时转续记',
      context,
      { getProvider: () => provider({ queryStatus: 'success' }).value },
    );
    assert.equal(continued.status, 'success');
    assert.equal(
      (await getCustomerReturnRequest(userA, querySuccessRequest.requestNo))
        .status,
      'completed',
    );

    const uncertainVoid = await createOrder('VOIDWAIT', userA, 'queued');
    const uncertainVoidRequest = await createReturnRequest(userA, {
      orderNo: uncertainVoid.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '渠道查询不确定时必须继续人工复核',
      images: [],
      items: [{ orderItemId: uncertainVoid.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        approveReturnRequest(
          uncertainVoidRequest.id,
          { items: [{ orderItemId: uncertainVoid.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider({ unknown: true }).value } },
        ),
      50001,
    );
    const uncertainPending = await getCustomerReturnRequest(
      userA,
      uncertainVoidRequest.requestNo,
    );
    assert(uncertainPending.refundId);
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, uncertainPending.refundId));
    await expectCode(
      () =>
        voidRefundAfterManualVerification(
          uncertainPending.refundId!,
          'pending 结果不得作废',
          context,
          { getProvider: () => provider({ queryStatus: 'pending' }).value },
        ),
      40923,
    );
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, uncertainPending.refundId));
    await expectCode(
      () =>
        voidRefundAfterManualVerification(
          uncertainPending.refundId!,
          '查询失败不得作废',
          context,
          { getProvider: () => provider({ queryThrows: true }).value },
        ),
      40923,
    );
    const [stillManual] = await db
      .select({
        status: refunds.status,
        needsManualReview: refunds.needsManualReview,
        processingToken: refunds.processingToken,
        processingUntil: refunds.processingUntil,
      })
      .from(refunds)
      .where(eq(refunds.id, uncertainPending.refundId));
    assert.equal(stillManual?.status, 'pending');
    assert.equal(stillManual?.needsManualReview, true);
    assert(stillManual?.processingToken);
    assert(
      stillManual?.processingUntil && stillManual.processingUntil > new Date(),
    );
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, uncertainPending.refundId));
    await voidRefundAfterManualVerification(
      uncertainPending.refundId,
      '后续明确未出款后允许结案',
      context,
      { getProvider: () => provider({ queryStatus: 'not_found' }).value },
    );

    const providerFactory = await createOrder('FACTORY', userA, 'queued');
    const providerFactoryRequest = await createReturnRequest(userA, {
      orderNo: providerFactory.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '渠道实例创建失败应进入有说明的冷却期',
      images: [],
      items: [{ orderItemId: providerFactory.item.id, quantity: 1 }],
    });
    await expectCode(
      () =>
        approveReturnRequest(
          providerFactoryRequest.id,
          { items: [{ orderItemId: providerFactory.item.id, restock: false }] },
          context,
          { refund: { getProvider: () => provider({ unknown: true }).value } },
        ),
      50001,
    );
    const providerFactoryPending = await getCustomerReturnRequest(
      userA,
      providerFactoryRequest.requestNo,
    );
    assert(providerFactoryPending.refundId);
    await db
      .update(refunds)
      .set({ processingUntil: new Date(Date.now() - 1_000) })
      .where(eq(refunds.id, providerFactoryPending.refundId));
    await expectCode(
      () =>
        voidRefundAfterManualVerification(
          providerFactoryPending.refundId!,
          '渠道工厂异常不得占用短租约卡死',
          context,
          {
            getProvider: () => {
              throw new Error('模拟渠道配置缺失');
            },
          },
        ),
      40923,
    );
    const [providerFactoryCooled] = await db
      .select({ processingUntil: refunds.processingUntil })
      .from(refunds)
      .where(eq(refunds.id, providerFactoryPending.refundId));
    assert(
      providerFactoryCooled?.processingUntil &&
        providerFactoryCooled.processingUntil.getTime() - Date.now() > 150_000,
    );

    const allocation = await createOrder('ALLOCATE', userA, 'queued');
    await db
      .update(orders)
      .set({
        discountAmount: '5.00',
        payableAmount: '15.00',
        paidAmount: '15.00',
      })
      .where(eq(orders.id, allocation.order.id));
    await db
      .update(payments)
      .set({ amount: '15.00' })
      .where(eq(payments.orderId, allocation.order.id));
    const allocationRequest = await createReturnRequest(userA, {
      orderNo: allocation.order.orderNo,
      reasonCode: 'quality_issue',
      reasonText: '审核页金额必须使用退款分摊函数',
      images: [],
      items: [{ orderItemId: allocation.item.id, quantity: 1 }],
    });
    const allocationQueue = await listAdminReturnRequests({
      status: 'pending',
      page: 1,
      pageSize: 100,
    });
    assert.equal(
      allocationQueue.list.find(
        (request) => request.id === allocationRequest.id,
      )?.items[0]?.refundableAmount,
      '15.00',
    );
    await db
      .update(orders)
      .set({ paidAmount: '14.00' })
      .where(eq(orders.id, allocation.order.id));
    const malformedAdminView = await listAdminReturnRequests({
      page: 1,
      pageSize: 100,
    });
    assert.equal(
      malformedAdminView.list.find(
        (request) => request.id === allocationRequest.id,
      )?.items[0]?.refundableAmount,
      null,
    );
    assert.equal(
      (await getCustomerReturnRequest(userA, allocationRequest.requestNo))
        .items[0]?.refundableAmount,
      null,
    );

    const referencedPath = `returns/${userA}/2026/09/${crypto.randomUUID()}.png`;
    const orphanPath = `returns/${userA}/2026/09/${crypto.randomUUID()}.png`;
    const legacyEvidenceUrl = (path: string) =>
      `https://old-storage.example.test/storage/v1/object/public/products/${path}`;
    await db
      .update(returnRequests)
      .set({ images: [legacyEvidenceUrl(referencedPath)] })
      .where(eq(returnRequests.id, allocationRequest.id));
    const removedPaths: string[] = [];
    const cleaned = await cleanupOrphanReturnEvidence(
      new Date('2026-09-18T12:00:00Z'),
      100,
      {
        listObjects: async () => [
          { path: referencedPath, createdAt: new Date('2026-09-16T00:00:00Z') },
          { path: orphanPath, createdAt: new Date('2026-09-16T00:00:00Z') },
        ],
        removeObjects: async (paths) => {
          removedPaths.push(...paths);
        },
      },
    );
    assert.equal(cleaned, 1);
    assert.deepEqual(removedPaths, [orphanPath]);

    const referencedPage = Array.from(
      { length: 101 },
      () => `returns/${userA}/2026/09/${crypto.randomUUID()}.png`,
    );
    const lateOrphanPath = `returns/${userA}/2026/09/${crypto.randomUUID()}.png`;
    await db
      .update(returnRequests)
      .set({ images: referencedPage })
      .where(eq(returnRequests.id, allocationRequest.id));
    const pagedRemovals: string[] = [];
    const pagedCleanup = await cleanupOrphanReturnEvidence(
      new Date('2026-09-18T12:00:00Z'),
      100,
      {
        listObjects: async () => [
          ...referencedPage.map((path) => ({
            path,
            createdAt: new Date('2026-09-16T00:00:00Z'),
          })),
          {
            path: lateOrphanPath,
            createdAt: new Date('2026-09-16T00:00:00Z'),
          },
        ],
        removeObjects: async (paths) => {
          pagedRemovals.push(...paths);
        },
      },
    );
    assert.equal(pagedCleanup, 1);
    assert.deepEqual(pagedRemovals, [lateOrphanPath]);

    const racingPath = `returns/${userA}/2026/09/${crypto.randomUUID()}.png`;
    let referenceChecks = 0;
    const raceRemovals: string[] = [];
    const raceCleanup = await cleanupOrphanReturnEvidence(
      new Date('2026-09-18T12:00:00Z'),
      100,
      {
        listObjects: async () => [
          { path: racingPath, createdAt: new Date('2026-09-16T00:00:00Z') },
        ],
        loadReferencedPaths: async () => {
          referenceChecks += 1;
          return referenceChecks === 1 ? new Set() : new Set([racingPath]);
        },
        removeObjects: async (paths) => {
          raceRemovals.push(...paths);
        },
      },
    );
    assert.equal(referenceChecks, 2);
    assert.equal(raceCleanup, 0);
    assert.deepEqual(raceRemovals, []);

    process.stdout.write(
      'Return request integration passed: ownership, evidence trust boundary, recovery state machine, shared refund accounting, concurrency, and manual void verified.\n',
    );
  } finally {
    if (adminId) {
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, adminId));
    }
    if (orderIds.length) {
      const requestRows = await db
        .select({ id: returnRequests.id })
        .from(returnRequests)
        .where(inArray(returnRequests.orderId, orderIds));
      const requestIds = requestRows.map((request) => request.id);
      if (requestIds.length) {
        await db
          .delete(returnRequestItems)
          .where(inArray(returnRequestItems.requestId, requestIds));
        await db
          .delete(returnRequests)
          .where(inArray(returnRequests.id, requestIds));
      }
      const refundRows = await db
        .select({ id: refunds.id })
        .from(refunds)
        .where(inArray(refunds.orderId, orderIds));
      const refundIds = refundRows.map((refund) => refund.id);
      if (refundIds.length) {
        await db
          .delete(refundItems)
          .where(inArray(refundItems.refundId, refundIds));
        await db.delete(refunds).where(inArray(refunds.id, refundIds));
      }
      await db.delete(payments).where(inArray(payments.orderId, orderIds));
      await db.delete(orders).where(inArray(orders.id, orderIds));
    }
    if (materialId) {
      await db
        .delete(materialStockMovements)
        .where(eq(materialStockMovements.materialId, materialId));
      await db.delete(materials).where(eq(materials.id, materialId));
    }
    if (adminId) await db.delete(adminUsers).where(eq(adminUsers.id, adminId));
    if (roleId) await db.delete(adminRoles).where(eq(adminRoles.id, roleId));
    await db
      .delete(userProfiles)
      .where(inArray(userProfiles.id, [userA, userB]));
    if (previousRules) {
      await db
        .insert(settings)
        .values({
          key: RETURN_RULES_SETTING_KEY,
          value: previousRules.value,
          remark: previousRules.remark,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: previousRules.value,
            remark: previousRules.remark,
            updatedAt: new Date(),
          },
        });
    } else {
      await db
        .delete(settings)
        .where(eq(settings.key, RETURN_RULES_SETTING_KEY));
    }
    if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousSupabaseUrl;
    if (previousStorageBucket === undefined) {
      delete process.env.SUPABASE_STORAGE_BUCKET;
    } else {
      process.env.SUPABASE_STORAGE_BUCKET = previousStorageBucket;
    }
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
