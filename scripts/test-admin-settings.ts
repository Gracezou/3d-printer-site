import assert from 'node:assert/strict';

import bcrypt from 'bcryptjs';
import { and, eq, inArray } from 'drizzle-orm';

import type { AdminIdentity } from '@/lib/auth/admin';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  adminOperationLogs,
  adminRoles,
  adminUsers,
  materials,
  products,
  productVariants,
  settings,
  shippingRules,
  userProfiles,
  variantMaterials,
} from '@/lib/db/schema';
import {
  getAdminSiteSettings,
  updateAdminShippingRules,
  updateAdminSiteSettings,
} from '@/lib/services/admin-settings.service';
import { previewOrder } from '@/lib/services/order-preview.service';
import { updateShippingRulesSchema } from '@/lib/validators/admin-settings';

async function main() {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
  const settingsSnapshot = await db
    .select()
    .from(settings)
    .where(inArray(settings.key, ['site_banners', 'site_info']));
  const rulesSnapshot = await db.select().from(shippingRules);
  let actorRoleId = '';
  let actorId = '';
  let userId = '';
  let productId = '';
  let materialId = '';

  try {
    const [actorRole] = await db
      .insert(adminRoles)
      .values({
        code: `test_settings_${suffix}`,
        name: '测试配置角色',
        permissions: ['settings:edit'],
      })
      .returning({ id: adminRoles.id, code: adminRoles.code });
    actorRoleId = actorRole!.id;
    const [actor] = await db
      .insert(adminUsers)
      .values({
        username: `settings_${suffix}`,
        passwordHash: await bcrypt.hash('SettingsPass123!', 12),
        name: '测试配置管理员',
        roleId: actorRoleId,
      })
      .returning({ id: adminUsers.id });
    actorId = actor!.id;
    const admin: AdminIdentity = {
      sub: actorId,
      username: `settings_${suffix}`,
      name: '测试配置管理员',
      roleCode: actorRole!.code,
      permissions: ['settings:edit'],
    };
    const context = { admin, ip: '127.0.0.1' };

    await updateAdminSiteSettings(
      {
        siteBanners: [
          {
            title: 'T093 测试 Banner',
            subtitle: '配置功能测试',
            imageUrl: null,
            linkUrl: '/products',
            buttonText: '查看商品',
          },
        ],
        siteInfo: {
          name: 'T093 测试站点',
          description: '站点配置功能测试',
          contact: 'test@example.com',
          about: '测试完成后恢复原配置。',
        },
      },
      context,
    );
    const configured = await getAdminSiteSettings();
    assert.equal(configured.siteInfo.name, 'T093 测试站点');
    assert.equal(configured.siteBanners.length, 1);

    userId = crypto.randomUUID();
    await db.insert(userProfiles).values({
      id: userId,
      phone: `131${suffix.slice(0, 8)}`,
    });
    const [address] = await db
      .insert(addresses)
      .values({
        userId,
        receiverName: 'T093 用户',
        receiverPhone: '13800138000',
        province: '测试省',
        provinceCode: '990001',
        city: '测试市',
        district: '测试区',
        detail: '测试路 93 号',
      })
      .returning({ id: addresses.id });
    const [material] = await db
      .insert(materials)
      .values({
        code: `T093-${suffix}`,
        name: 'T093 测试耗材',
        materialType: 'PLA',
        stockGrams: '1000.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      })
      .returning({ id: materials.id });
    materialId = material!.id;
    const [product] = await db
      .insert(products)
      .values({
        name: 'T093 运费测试商品',
        slug: `t093-shipping-${suffix}`,
        status: 'on_sale',
      })
      .returning({ id: products.id });
    productId = product!.id;
    const [variant] = await db
      .insert(productVariants)
      .values({
        productId,
        skuCode: `T093-${suffix}`,
        name: '标准款',
        price: '50.00',
        weightGrams: '600.00',
      })
      .returning({ id: productVariants.id });
    await db.insert(variantMaterials).values({
      variantId: variant!.id,
      materialId,
      grams: '50.00',
    });

    const before = await previewOrder(userId, {
      items: [{ variantId: variant!.id, quantity: 1 }],
      addressId: address!.id,
    });

    const baseRules = rulesSnapshot.map((rule) => ({
      id: rule.id,
      name: rule.name,
      provinceCodes: rule.provinceCodes,
      firstWeightGrams: rule.firstWeightGrams,
      firstAmount: rule.firstAmount,
      additionalWeightGrams: rule.additionalWeightGrams,
      additionalAmount: rule.additionalAmount,
      freeThreshold: rule.freeThreshold,
      isActive: rule.isActive,
      sortOrder: rule.sortOrder,
    }));
    const fallbackCount = baseRules.filter(
      (rule) => rule.isActive && rule.provinceCodes.length === 0,
    ).length;
    assert.equal(fallbackCount, 1, '测试环境应有且仅有一条启用兜底规则');
    const changedRules = updateShippingRulesSchema.parse({
      rules: [
        {
          name: 'T093 测试省运费',
          provinceCodes: ['990001'],
          firstWeightGrams: '1000.00',
          firstAmount: '23.45',
          additionalWeightGrams: '500.00',
          additionalAmount: '6.00',
          freeThreshold: null,
          isActive: true,
          sortOrder: -10000,
        },
        ...baseRules,
      ],
    });
    await updateAdminShippingRules(changedRules, context);
    const after = await previewOrder(userId, {
      items: [{ variantId: variant!.id, quantity: 1 }],
      addressId: address!.id,
    });
    assert.notEqual(before.shippingAmount, after.shippingAmount);
    assert.equal(after.shippingAmount, '23.45');
    assert.equal(after.payableAmount, '73.45');

    assert.equal(
      updateShippingRulesSchema.safeParse({
        rules: [
          { ...changedRules.rules[0], provinceCodes: [], isActive: false },
        ],
      }).success,
      false,
      '必须拒绝没有启用兜底规则的配置',
    );

    const logs = await db
      .select({ action: adminOperationLogs.action })
      .from(adminOperationLogs)
      .where(
        and(
          eq(adminOperationLogs.adminId, actorId),
          inArray(adminOperationLogs.action, [
            'settings.update',
            'shipping_rules.update',
          ]),
        ),
      );
    assert.equal(logs.length, 2);

    process.stdout.write(
      'Admin-settings functional test passed: site content, banner persistence, shipping validation, preview price refresh, and audit logging.\n',
    );
  } finally {
    if (productId) await db.delete(products).where(eq(products.id, productId));
    if (materialId)
      await db.delete(materials).where(eq(materials.id, materialId));
    if (userId)
      await db.delete(userProfiles).where(eq(userProfiles.id, userId));

    await db.delete(shippingRules);
    if (rulesSnapshot.length)
      await db.insert(shippingRules).values(rulesSnapshot);
    await db
      .delete(settings)
      .where(inArray(settings.key, ['site_banners', 'site_info']));
    if (settingsSnapshot.length)
      await db.insert(settings).values(settingsSnapshot);

    if (actorId)
      await db
        .delete(adminOperationLogs)
        .where(eq(adminOperationLogs.adminId, actorId));
    if (actorId) await db.delete(adminUsers).where(eq(adminUsers.id, actorId));
    if (actorRoleId)
      await db.delete(adminRoles).where(eq(adminRoles.id, actorRoleId));
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Admin-settings test failed: ${message}\n`);
  process.exitCode = 1;
});
