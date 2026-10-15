import { randomUUID } from 'node:crypto';

import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm';
import nodemailer from 'nodemailer';

import { getDb } from '@/lib/db/client';
import {
  deviceBrands,
  deviceModels,
  emailMessages,
  modelRequests,
  orders,
  productDeviceModels,
  products,
  userProfiles,
  type BusinessEmailKind,
  type BusinessEmailPayload,
} from '@/lib/db/schema';
import { logger, maskEmail } from '@/lib/logger';
import type { DbTransaction } from '@/lib/services/admin-log.service';

export type BusinessEmailEvent = Exclude<BusinessEmailKind, 'model_opened'>;

const maxAttempts = 5;
const maxBatchSize = 3;

export async function enqueueOrderEmail(
  tx: DbTransaction,
  kind: BusinessEmailEvent,
  orderId: string,
  referenceId: string,
  requestNo?: string,
): Promise<void> {
  const [order] = await tx
    .select({ orderNo: orders.orderNo, email: userProfiles.email })
    .from(orders)
    .innerJoin(userProfiles, eq(userProfiles.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!order?.email) {
    logger.warn({ kind, orderId }, 'Order notification recipient missing');
    return;
  }
  await tx
    .insert(emailMessages)
    .values({
      dedupeKey: `${kind}:${referenceId}`,
      kind,
      recipientEmail: order.email,
      payload: {
        orderNo: order.orderNo,
        requestNo,
        path: `/account/orders/${encodeURIComponent(order.orderNo)}`,
      },
    })
    .onConflictDoNothing({ target: emailMessages.dedupeKey });
}

export async function enqueueEligibleModelEmails(
  batchSize = 100,
): Promise<number> {
  const limit = Math.max(1, Math.min(batchSize, 100));
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .selectDistinctOn([modelRequests.id], {
        requestId: modelRequests.id,
        email: modelRequests.email,
        modelName: deviceModels.name,
        modelSlug: deviceModels.slug,
        brandName: deviceBrands.name,
        brandSlug: deviceBrands.slug,
        productName: products.name,
      })
      .from(modelRequests)
      .innerJoin(deviceModels, eq(modelRequests.deviceModelId, deviceModels.id))
      .innerJoin(deviceBrands, eq(deviceModels.brandId, deviceBrands.id))
      .innerJoin(
        productDeviceModels,
        eq(productDeviceModels.deviceModelId, deviceModels.id),
      )
      .innerJoin(products, eq(products.id, productDeviceModels.productId))
      .where(
        and(
          eq(modelRequests.status, 'pending'),
          eq(deviceBrands.isVisible, true),
          eq(deviceModels.isVisible, true),
          eq(deviceModels.isMolded, true),
          eq(products.status, 'on_sale'),
          isNull(products.deletedAt),
          sql<boolean>`EXISTS (
            SELECT 1 FROM product_variants variant
            JOIN v_variant_availability availability ON availability.variant_id = variant.id
            WHERE variant.product_id = ${products.id}
              AND variant.is_active = true
              AND availability.available_qty > 0
          )`,
          sql<boolean>`NOT EXISTS (
            SELECT 1 FROM email_messages queued
            WHERE queued.dedupe_key = 'model_opened:' || ${modelRequests.id}::text
          )`,
        ),
      )
      .orderBy(asc(modelRequests.id), asc(products.id))
      .limit(limit);

    let inserted = 0;
    for (const row of rows) {
      const result = await tx
        .insert(emailMessages)
        .values({
          dedupeKey: `model_opened:${row.requestId}`,
          kind: 'model_opened',
          recipientEmail: row.email,
          payload: {
            modelRequestId: row.requestId,
            modelName: `${row.brandName} ${row.modelName}`,
            productName: row.productName,
            path: `/devices/${encodeURIComponent(row.brandSlug)}/${encodeURIComponent(row.modelSlug)}`,
          },
        })
        .onConflictDoNothing({ target: emailMessages.dedupeKey })
        .returning({ id: emailMessages.id });
      inserted += result.length;
    }
    return inserted;
  });
}

export interface EmailContent {
  subject: string;
  text: string;
}

export function renderBusinessEmail(
  kind: BusinessEmailKind,
  payload: BusinessEmailPayload,
  siteOrigin: string,
): EmailContent {
  if (!payload.path.startsWith('/') || payload.path.startsWith('//')) {
    throw new Error('Invalid business email path');
  }
  const url = new URL(payload.path, `${siteOrigin}/`).toString();
  const order = payload.orderNo ? `订单 ${payload.orderNo}` : '您的订单';
  const withLink = (message: string) =>
    `${message}\n\n查看详情：${url}\n\n如订单状态与邮件不同，请以站内最新状态为准。`;
  switch (kind) {
    case 'payment_paid':
      return {
        subject: `${order} 支付成功`,
        text: withLink(`${order}已支付成功，我们将按单安排制作。`),
      };
    case 'production_started':
      return {
        subject: `${order} 开始制作`,
        text: withLink(`${order}已进入制作流程。`),
      };
    case 'order_shipped':
      return {
        subject: `${order} 已发货`,
        text: withLink(`${order}已发货，物流信息可在订单详情查看。`),
      };
    case 'return_approved':
      return {
        subject: `${order} 售后申请已通过审核`,
        text: withLink(
          `${order}的售后申请${payload.requestNo ? `（${payload.requestNo}）` : ''}已通过审核，退款状态请以订单详情为准。`,
        ),
      };
    case 'return_rejected':
      return {
        subject: `${order} 售后申请审核结果`,
        text: withLink(
          `${order}的售后申请${payload.requestNo ? `（${payload.requestNo}）` : ''}未通过审核，请在订单中心查看处理结果。`,
        ),
      };
    case 'refund_succeeded':
      return {
        subject: `${order} 退款已处理`,
        text: withLink(`${order}的退款已处理，实际到账时间以原支付渠道为准。`),
      };
    case 'model_opened':
      return {
        subject: `${payload.modelName ?? '您登记的机型'}保护壳已可购买`,
        text: withLink(
          `您登记的${payload.modelName ?? '机型'}现在已有可购买的保护壳${payload.productName ? `：${payload.productName}` : ''}。`,
        ),
      };
  }
}

interface MailConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
  siteOrigin: string;
  allowedRecipients: Set<string> | null;
}

function getMailConfig(): MailConfig | null {
  if (process.env.BUSINESS_MAIL_ENABLED !== 'true') return null;
  const host = process.env.BUSINESS_SMTP_HOST?.trim();
  const port = Number(process.env.BUSINESS_SMTP_PORT);
  const user = process.env.BUSINESS_SMTP_USER?.trim();
  const password = process.env.BUSINESS_SMTP_PASSWORD;
  const from = process.env.BUSINESS_MAIL_FROM?.trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (
    !host ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !user ||
    !password ||
    !from ||
    !siteUrl
  ) {
    throw new Error('Business mail configuration is incomplete');
  }
  const parsedSiteUrl = new URL(siteUrl);
  if (!['http:', 'https:'].includes(parsedSiteUrl.protocol)) {
    throw new Error('Business mail site URL must use HTTP or HTTPS');
  }
  const siteOrigin = parsedSiteUrl.origin;
  const rawRecipients = process.env.BUSINESS_MAIL_ALLOWED_RECIPIENTS?.trim();
  if (process.env.APP_ENV === 'staging' && !rawRecipients) {
    throw new Error('Stage business mail recipient allowlist is required');
  }
  return {
    host,
    port,
    user,
    password,
    from,
    siteOrigin,
    allowedRecipients: rawRecipients
      ? new Set(
          rawRecipients
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        )
      : null,
  };
}

export function assertBusinessMailReady(): boolean {
  return getMailConfig() !== null;
}

export interface EmailSender {
  send(input: {
    to: string;
    subject: string;
    text: string;
    messageId: string;
  }): Promise<{ messageId: string }>;
}

function smtpSender(config: MailConfig): EmailSender {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send(input) {
      const result = await transport.sendMail({
        from: config.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        messageId: input.messageId,
      });
      return { messageId: result.messageId };
    },
  };
}

export function classifyMailFailure(
  error: unknown,
): 'retryable' | 'permanent' | 'unknown' {
  const code =
    typeof error === 'object' && error !== null && 'responseCode' in error
      ? error.responseCode
      : null;
  if (typeof code === 'number' && code >= 400 && code < 500) {
    return 'retryable';
  }
  if (typeof code === 'number' && code >= 500 && code < 600) {
    return 'permanent';
  }
  return 'unknown';
}

export async function dispatchBusinessEmails(
  senderOverride?: EmailSender,
): Promise<{
  claimed: number;
  sent: number;
  failed: number;
  unknown: number;
  disabled: boolean;
}> {
  const config = getMailConfig();
  if (!config) {
    return { claimed: 0, sent: 0, failed: 0, unknown: 0, disabled: true };
  }
  const sender = senderOverride ?? smtpSender(config);
  const now = new Date();
  await getDb()
    .update(emailMessages)
    .set({
      status: 'unknown',
      leaseToken: null,
      leaseUntil: null,
      lastError: 'lease_expired_delivery_unknown',
      updatedAt: now,
    })
    .where(
      and(
        eq(emailMessages.status, 'sending'),
        lte(emailMessages.leaseUntil, sql`now()`),
      ),
    );

  const claimed = await getDb().transaction(async (tx) => {
    const candidates = await tx
      .select()
      .from(emailMessages)
      .where(
        and(
          eq(emailMessages.status, 'pending'),
          lte(emailMessages.nextAttemptAt, sql`now()`),
        ),
      )
      .orderBy(asc(emailMessages.nextAttemptAt), asc(emailMessages.id))
      .limit(maxBatchSize)
      .for('update', { skipLocked: true });
    const result = [];
    for (const row of candidates) {
      const token = randomUUID();
      await tx
        .update(emailMessages)
        .set({
          status: 'sending',
          leaseToken: token,
          leaseUntil: new Date(now.getTime() + 180_000),
          attempts: row.attempts + 1,
          updatedAt: now,
        })
        .where(eq(emailMessages.id, row.id));
      result.push({ ...row, leaseToken: token, attempts: row.attempts + 1 });
    }
    return result;
  });

  let sent = 0;
  let failed = 0;
  let unknown = 0;
  for (const row of claimed) {
    try {
      if (
        config.allowedRecipients &&
        !config.allowedRecipients.has(row.recipientEmail.toLowerCase())
      ) {
        await getDb()
          .update(emailMessages)
          .set({
            status: 'failed',
            lastError: 'recipient_not_allowed',
            leaseToken: null,
            leaseUntil: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(emailMessages.id, row.id),
              eq(emailMessages.leaseToken, row.leaseToken),
            ),
          );
        failed += 1;
        continue;
      }
      const content = renderBusinessEmail(
        row.kind,
        row.payload,
        config.siteOrigin,
      );
      const result = await sender.send({
        to: row.recipientEmail,
        ...content,
        messageId: `<${row.id}@${new URL(config.siteOrigin).hostname}>`,
      });
      await getDb().transaction(async (tx) => {
        const [updated] = await tx
          .update(emailMessages)
          .set({
            status: 'sent',
            providerMessageId: result.messageId,
            sentAt: new Date(),
            leaseToken: null,
            leaseUntil: null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(emailMessages.id, row.id),
              eq(emailMessages.status, 'sending'),
              eq(emailMessages.leaseToken, row.leaseToken),
            ),
          )
          .returning({ id: emailMessages.id });
        if (
          updated &&
          row.kind === 'model_opened' &&
          row.payload.modelRequestId
        ) {
          await tx
            .update(modelRequests)
            .set({ status: 'notified' })
            .where(
              and(
                eq(modelRequests.id, row.payload.modelRequestId),
                eq(modelRequests.status, 'pending'),
              ),
            );
        }
      });
      sent += 1;
    } catch (error: unknown) {
      const outcome = classifyMailFailure(error);
      const status =
        outcome === 'retryable' && row.attempts < maxAttempts
          ? 'pending'
          : outcome === 'unknown'
            ? 'unknown'
            : 'failed';
      await getDb()
        .update(emailMessages)
        .set({
          status,
          nextAttemptAt: new Date(Date.now() + 2 ** row.attempts * 60_000),
          lastError: `smtp_${outcome}`,
          leaseToken: null,
          leaseUntil: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(emailMessages.id, row.id),
            eq(emailMessages.leaseToken, row.leaseToken),
          ),
        );
      if (status === 'unknown') unknown += 1;
      else failed += 1;
      logger.warn(
        {
          id: row.id,
          kind: row.kind,
          recipient: maskEmail(row.recipientEmail),
          outcome,
        },
        'Business email delivery not confirmed',
      );
    }
  }
  return { claimed: claimed.length, sent, failed, unknown, disabled: false };
}
