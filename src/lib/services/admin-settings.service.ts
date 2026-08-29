import { asc, sql } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { getDb } from '@/lib/db/client';
import { settings, shippingRules } from '@/lib/db/schema';
import { withAdminLog } from '@/lib/services/admin-log.service';
import {
  siteBannerSchema,
  siteInfoSchema,
} from '@/lib/validators/admin-settings';
import type {
  UpdateShippingRulesInput,
  UpdateSiteSettingsInput,
} from '@/lib/validators/admin-settings';

interface WriteContext {
  admin: AdminIdentity;
  ip: string;
}

const DEFAULT_SITE_INFO = {
  name: '层光造物',
  description: '专注有趣、耐看的 3D 打印成品，按单生产，认真交付。',
  contact: '工作日 09:00–18:00',
  about:
    '我们从数字模型出发，用稳定的材料与细致的打印工艺，让好设计成为日常生活的一部分。',
};

export async function getAdminSiteSettings() {
  const rows = await getDb()
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(sql`${settings.key} IN ('site_banners', 'site_info')`);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const banners = siteBannerSchema
    .array()
    .safeParse(values.get('site_banners'));
  const info = siteInfoSchema.safeParse(values.get('site_info'));
  return {
    siteBanners: banners.success ? banners.data : [],
    siteInfo: info.success ? info.data : DEFAULT_SITE_INFO,
  };
}

export async function updateAdminSiteSettings(
  input: UpdateSiteSettingsInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      const now = new Date();
      await tx
        .insert(settings)
        .values([
          {
            key: 'site_banners',
            value: input.siteBanners,
            remark: '首页 Banner 配置',
            updatedAt: now,
          },
          {
            key: 'site_info',
            value: input.siteInfo,
            remark: '站点基础信息',
            updatedAt: now,
          },
        ])
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: sql`excluded.value`, updatedAt: now },
        });
      return input;
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'settings.update',
      targetType: 'settings',
      targetId: 'site',
      payload: { bannerCount: input.siteBanners.length },
      ip: context.ip,
    },
  );
}

export async function getAdminShippingRules() {
  return getDb()
    .select()
    .from(shippingRules)
    .orderBy(asc(shippingRules.sortOrder), asc(shippingRules.createdAt));
}

export async function updateAdminShippingRules(
  input: UpdateShippingRulesInput,
  context: WriteContext,
) {
  return withAdminLog(
    async (tx) => {
      await tx.execute(
        sql`LOCK TABLE ${shippingRules} IN SHARE ROW EXCLUSIVE MODE`,
      );
      await tx.delete(shippingRules);
      const rows = await tx
        .insert(shippingRules)
        .values(
          input.rules.map((rule) => ({
            ...(rule.id ? { id: rule.id } : {}),
            name: rule.name,
            provinceCodes: rule.provinceCodes,
            firstWeightGrams: rule.firstWeightGrams,
            firstAmount: rule.firstAmount,
            additionalWeightGrams: rule.additionalWeightGrams,
            additionalAmount: rule.additionalAmount,
            freeThreshold: rule.freeThreshold,
            isActive: rule.isActive,
            sortOrder: rule.sortOrder,
            updatedAt: new Date(),
          })),
        )
        .returning();
      return rows.sort((left, right) => left.sortOrder - right.sortOrder);
    },
    {
      adminId: context.admin.sub,
      adminName: context.admin.name,
      action: 'shipping_rules.update',
      targetType: 'shipping_rules',
      targetId: 'all',
      payload: {
        ruleCount: input.rules.length,
        activeCount: input.rules.filter((rule) => rule.isActive).length,
      },
      ip: context.ip,
    },
  );
}
