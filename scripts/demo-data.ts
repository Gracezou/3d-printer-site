import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

import bcrypt from 'bcryptjs';
import { eq, inArray, sql } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import {
  addresses,
  adminOperationLogs,
  adminRoles,
  adminUsers,
  cartItems,
  carts,
  categories,
  discountCodes,
  discountRedemptions,
  materialStockMovements,
  materials,
  orderItems,
  orders,
  payments,
  printJobs,
  productVariants,
  products,
  promotions,
  refunds,
  settings,
  shipments,
  shippingRules,
  userProfiles,
  variantMaterials,
  type BomSnapshotItem,
} from '@/lib/db/schema';
import type { DbTransaction } from '@/lib/services/admin-log.service';

const ids = {
  role: '00000000-0000-4000-8000-000000000101',
  admin: '00000000-0000-4000-8000-000000000102',
  categoryDecor: '00000000-0000-4000-8000-000000000201',
  categoryDesk: '00000000-0000-4000-8000-000000000202',
  materialBlack: '00000000-0000-4000-8000-000000000301',
  materialWhite: '00000000-0000-4000-8000-000000000302',
  materialBlue: '00000000-0000-4000-8000-000000000303',
  materialLow: '00000000-0000-4000-8000-000000000304',
  productLamp: '00000000-0000-4000-8000-000000000401',
  productSoldOut: '00000000-0000-4000-8000-000000000402',
  productDraft: '00000000-0000-4000-8000-000000000403',
  variantLampSmall: '00000000-0000-4000-8000-000000000411',
  variantLampLarge: '00000000-0000-4000-8000-000000000412',
  variantSoldOut: '00000000-0000-4000-8000-000000000413',
  variantDraft: '00000000-0000-4000-8000-000000000414',
  promotionFixed: '00000000-0000-4000-8000-000000000501',
  promotionPercent: '00000000-0000-4000-8000-000000000502',
  promotionShipping: '00000000-0000-4000-8000-000000000503',
  codeFixed: '00000000-0000-4000-8000-000000000511',
  codePercent: '00000000-0000-4000-8000-000000000512',
  codeShipping: '00000000-0000-4000-8000-000000000513',
  shipping: '00000000-0000-4000-8000-000000000601',
  userOne: '00000000-0000-4000-8000-000000000701',
  userTwo: '00000000-0000-4000-8000-000000000702',
  userDisabled: '00000000-0000-4000-8000-000000000703',
  addressOne: '00000000-0000-4000-8000-000000000711',
  addressTwo: '00000000-0000-4000-8000-000000000712',
  cart: '00000000-0000-4000-8000-000000000721',
  cartItem: '00000000-0000-4000-8000-000000000722',
} as const;

const orderDefinitions = [
  ['pending', 'pending_payment'],
  ['paid', 'paid'],
  ['production', 'in_production'],
  ['shipment', 'pending_shipment'],
  ['shipped', 'shipped'],
  ['completed', 'completed'],
  ['cancelled', 'cancelled'],
  ['refunding', 'refunding'],
  ['refunded', 'refunded'],
] as const;

function orderId(index: number): string {
  return `00000000-0000-4000-8000-${String(800 + index).padStart(12, '0')}`;
}

function orderItemId(index: number): string {
  return `00000000-0000-4000-8000-${String(900 + index).padStart(12, '0')}`;
}

function paymentId(index: number): string {
  return `00000000-0000-4000-8000-${String(1000 + index).padStart(12, '0')}`;
}

interface SettingBackupItem {
  exists: boolean;
  value?: unknown;
  remark?: string | null;
}

interface SettingsBackup {
  siteBanners: SettingBackupItem;
  siteInfo: SettingBackupItem;
}

const DEMO_SETTING_BACKUP_KEY = 'demo_v01_settings_backup';
const demoMaterialIds = [
  ids.materialBlack,
  ids.materialWhite,
  ids.materialBlue,
  ids.materialLow,
];
const demoProductIds = [ids.productLamp, ids.productSoldOut, ids.productDraft];
const demoPromotionIds = [
  ids.promotionFixed,
  ids.promotionPercent,
  ids.promotionShipping,
];
const demoCodeIds = [ids.codeFixed, ids.codePercent, ids.codeShipping];
const demoUserIds = [ids.userOne, ids.userTwo, ids.userDisabled];
const demoOrderIds = orderDefinitions.map((_, index) => orderId(index + 1));

function isSettingsBackup(value: unknown): value is SettingsBackup {
  return Boolean(
    value &&
    typeof value === 'object' &&
    'siteBanners' in value &&
    'siteInfo' in value,
  );
}

async function restoreSiteSettings(tx: DbTransaction): Promise<void> {
  const [backupRow] = await tx
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, DEMO_SETTING_BACKUP_KEY))
    .limit(1);
  if (!isSettingsBackup(backupRow?.value)) return;
  const backup = backupRow.value;
  await tx
    .delete(settings)
    .where(inArray(settings.key, ['site_banners', 'site_info']));
  const restored = [
    ['site_banners', backup.siteBanners],
    ['site_info', backup.siteInfo],
  ] as const;
  for (const [key, item] of restored) {
    if (item.exists) {
      await tx.insert(settings).values({
        key,
        value: item.value,
        remark: item.remark,
      });
    }
  }
  await tx.delete(settings).where(eq(settings.key, DEMO_SETTING_BACKUP_KEY));
}

async function resetDemoData(tx: DbTransaction): Promise<void> {
  await tx.delete(refunds).where(inArray(refunds.orderId, demoOrderIds));
  await tx.delete(payments).where(inArray(payments.orderId, demoOrderIds));
  await tx.delete(orders).where(inArray(orders.id, demoOrderIds));
  await tx.delete(cartItems).where(eq(cartItems.id, ids.cartItem));
  await tx.delete(carts).where(eq(carts.id, ids.cart));
  await tx.delete(addresses).where(inArray(addresses.userId, demoUserIds));
  await tx.delete(userProfiles).where(inArray(userProfiles.id, demoUserIds));
  await tx
    .delete(adminOperationLogs)
    .where(eq(adminOperationLogs.adminId, ids.admin));
  await tx.delete(adminUsers).where(eq(adminUsers.id, ids.admin));
  await tx.delete(adminRoles).where(eq(adminRoles.id, ids.role));
  await tx.delete(discountCodes).where(inArray(discountCodes.id, demoCodeIds));
  await tx.delete(promotions).where(inArray(promotions.id, demoPromotionIds));
  await tx.delete(products).where(inArray(products.id, demoProductIds));
  await tx
    .delete(materialStockMovements)
    .where(inArray(materialStockMovements.materialId, demoMaterialIds));
  await tx.delete(materials).where(inArray(materials.id, demoMaterialIds));
  await tx
    .delete(categories)
    .where(inArray(categories.id, [ids.categoryDecor, ids.categoryDesk]));
  await tx.delete(shippingRules).where(eq(shippingRules.id, ids.shipping));
  await restoreSiteSettings(tx);
}

async function backupAndWriteSiteSettings(tx: DbTransaction): Promise<void> {
  const rows = await tx
    .select({
      key: settings.key,
      value: settings.value,
      remark: settings.remark,
    })
    .from(settings)
    .where(inArray(settings.key, ['site_banners', 'site_info']));
  const values = new Map(rows.map((row) => [row.key, row]));
  const toBackup = (key: string): SettingBackupItem => {
    const row = values.get(key);
    return row
      ? { exists: true, value: row.value, remark: row.remark }
      : { exists: false };
  };
  await tx.insert(settings).values({
    key: DEMO_SETTING_BACKUP_KEY,
    value: {
      siteBanners: toBackup('site_banners'),
      siteInfo: toBackup('site_info'),
    } satisfies SettingsBackup,
    remark: 'v0.1 演示数据覆盖站点配置前的备份',
  });
  await tx
    .insert(settings)
    .values([
      {
        key: 'site_banners',
        value: [
          {
            title: '让灵感逐层成形',
            subtitle: 'v0.1 演示数据：从耗材、生产到交付的完整流程。',
            imageUrl: null,
            linkUrl: '/products',
            buttonText: '查看演示商品',
          },
          {
            title: '按单生产，减少浪费',
            subtitle: '每一件作品都从真实耗材库存开始。',
            imageUrl: null,
            linkUrl: '/category/demo-desk',
            buttonText: '浏览桌面好物',
          },
        ],
        remark: 'v0.1 演示 Banner',
      },
      {
        key: 'site_info',
        value: {
          name: '层光造物 v0.1 演示站',
          description: '3D 打印成品独立站完整业务演示环境。',
          contact: '仅供测试，请勿填写真实个人信息',
          about: '本环境展示从耗材、商品、下单、支付、生产到物流的完整链路。',
        },
        remark: 'v0.1 演示站点信息',
      },
    ])
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: sql`excluded.value`, remark: sql`excluded.remark` },
    });
}

function bomSnapshot(): BomSnapshotItem[] {
  return [
    {
      material_id: ids.materialBlack,
      material_name: '演示 PLA 黑色',
      grams: '100.00',
      waste_rate: '0.0500',
      required_grams: '105.0000',
    },
    {
      material_id: ids.materialWhite,
      material_name: '演示 PLA 白色',
      grams: '20.00',
      waste_rate: '0.1000',
      required_grams: '22.0000',
    },
  ];
}

async function createDemoOrder(
  tx: DbTransaction,
  index: number,
  status: (typeof orderDefinitions)[number][1],
): Promise<void> {
  const id = orderId(index);
  const itemId = orderItemId(index);
  const createdAt = new Date(Date.now() - (10 - index) * 86_400_000);
  const paid = !['pending_payment', 'cancelled'].includes(status);
  await tx.insert(orders).values({
    id,
    orderNo: `DEMO-V01-${String(index).padStart(3, '0')}`,
    userId: index % 2 ? ids.userOne : ids.userTwo,
    status: 'pending_payment',
    itemsAmount: '199.00',
    discountAmount: index === 1 ? '20.00' : '0.00',
    shippingAmount: '0.00',
    payableAmount: index === 1 ? '179.00' : '199.00',
    paidAmount: paid ? '199.00' : '0.00',
    refundedAmount: status === 'refunded' ? '199.00' : '0.00',
    discountCodeId: index === 1 ? ids.codeFixed : null,
    discountCode: index === 1 ? 'DEMO20' : null,
    receiverName: index % 2 ? '演示用户甲' : '演示用户乙',
    receiverPhone: index % 2 ? '19900000001' : '19900000002',
    receiverProvince: '广东省',
    receiverCity: '深圳市',
    receiverDistrict: '南山区',
    receiverDetail: `演示路 ${index} 号（虚构地址）`,
    buyerRemark: `v0.1 演示订单：${status}`,
    reservedUntil:
      status === 'pending_payment' ? new Date(Date.now() + 30 * 60_000) : null,
    paidAt: paid ? new Date(createdAt.getTime() + 60_000) : null,
    createdAt,
    updatedAt: createdAt,
  });
  await tx.insert(orderItems).values({
    id: itemId,
    orderId: id,
    productId: ids.productLamp,
    variantId: ids.variantLampLarge,
    productName: '几何氛围灯',
    variantName: '大号 / 黑白拼色',
    skuCode: 'DEMO-LAMP-LARGE',
    unitPrice: '199.00',
    quantity: 1,
    subtotal: '199.00',
    bomSnapshot: bomSnapshot(),
    createdAt,
  });
  await tx.execute(sql`SELECT fn_reserve_order_stock(${id}::uuid)`);

  if (index === 1) {
    await tx.insert(discountRedemptions).values({
      codeId: ids.codeFixed,
      promotionId: ids.promotionFixed,
      userId: ids.userOne,
      orderId: id,
      discountAmount: '20.00',
      status: 'occupied',
    });
    await tx
      .update(discountCodes)
      .set({ usedCount: 1 })
      .where(eq(discountCodes.id, ids.codeFixed));
  }

  if (status === 'cancelled') {
    await tx.execute(sql`SELECT fn_release_order_stock(${id}::uuid)`);
  } else if (paid) {
    await tx.execute(sql`SELECT fn_commit_order_stock(${id}::uuid)`);
  }

  const statusTimes = {
    shippedAt: ['shipped', 'completed'].includes(status)
      ? new Date(createdAt.getTime() + 3 * 86_400_000)
      : null,
    completedAt:
      status === 'completed'
        ? new Date(createdAt.getTime() + 5 * 86_400_000)
        : null,
    cancelledAt:
      status === 'cancelled'
        ? new Date(createdAt.getTime() + 20 * 60_000)
        : null,
  };
  await tx
    .update(orders)
    .set({
      status,
      ...statusTimes,
      cancelReason: status === 'cancelled' ? 'user_cancel' : null,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, id));

  await tx.insert(payments).values({
    id: paymentId(index),
    orderId: id,
    outTradeNo: `DEMO-PAY-${String(index).padStart(3, '0')}`,
    provider: 'mock',
    providerTxnId: paid ? `DEMO-TXN-${String(index).padStart(3, '0')}` : null,
    amount: index === 1 ? '179.00' : '199.00',
    status:
      status === 'pending_payment'
        ? 'pending'
        : status === 'cancelled'
          ? 'closed'
          : status === 'refunded'
            ? 'refunded'
            : 'success',
    paidAt: paid ? new Date(createdAt.getTime() + 60_000) : null,
  });

  if (
    [
      'paid',
      'in_production',
      'pending_shipment',
      'shipped',
      'completed',
    ].includes(status)
  ) {
    const printStatus =
      status === 'paid'
        ? 'queued'
        : status === 'in_production'
          ? 'printing'
          : 'done';
    await tx.insert(printJobs).values({
      orderId: id,
      orderItemId: itemId,
      variantId: ids.variantLampLarge,
      quantity: 1,
      status: printStatus,
      printerName: printStatus === 'queued' ? null : 'Demo Printer A1',
      assignedTo: ids.admin,
      startedAt:
        printStatus === 'queued'
          ? null
          : new Date(createdAt.getTime() + 86_400_000),
      finishedAt:
        printStatus === 'done'
          ? new Date(createdAt.getTime() + 2 * 86_400_000)
          : null,
      remark: 'v0.1 演示生产任务',
    });
  }

  if (['shipped', 'completed'].includes(status)) {
    await tx.insert(shipments).values({
      orderId: id,
      carrierCode: 'sf',
      carrierName: '顺丰速运（演示）',
      trackingNo: `DEMO-SF-${String(index).padStart(6, '0')}`,
      shippedAt: statusTimes.shippedAt!,
      operatorId: ids.admin,
      remark: '虚构物流单号',
    });
  }

  if (['refunding', 'refunded'].includes(status)) {
    await tx.insert(refunds).values({
      orderId: id,
      paymentId: paymentId(index),
      outRefundNo: `DEMO-REFUND-${String(index).padStart(3, '0')}`,
      providerRefundId:
        status === 'refunded'
          ? `DEMO-PROVIDER-REFUND-${String(index).padStart(3, '0')}`
          : null,
      amount: '199.00',
      isFullRefund: true,
      restock: status === 'refunded',
      reason: 'v0.1 演示退款',
      status: status === 'refunded' ? 'success' : 'pending',
      operatorId: ids.admin,
    });
    if (status === 'refunded') {
      await tx.execute(
        sql`SELECT fn_refund_return_stock(${id}::uuid, ${ids.admin}::uuid)`,
      );
    }
  }
}

async function seedDemoData(passwordHash: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await resetDemoData(tx);
    await backupAndWriteSiteSettings(tx);

    await tx.insert(adminRoles).values({
      id: ids.role,
      code: 'demo_operator',
      name: 'v0.1 演示运营',
      permissions: [
        'dashboard:view',
        'order:view',
        'order:ship',
        'order:remark',
        'production:view',
        'production:update',
        'product:view',
        'material:view',
        'user:view',
        'promotion:view',
      ],
    });
    await tx.insert(adminUsers).values({
      id: ids.admin,
      username: 'demo_operator',
      passwordHash,
      name: 'v0.1 演示运营',
      roleId: ids.role,
    });
    await tx.insert(categories).values([
      {
        id: ids.categoryDecor,
        name: '演示家居摆件',
        slug: 'demo-decor',
        sortOrder: -100,
      },
      {
        id: ids.categoryDesk,
        name: '演示桌面好物',
        slug: 'demo-desk',
        sortOrder: -90,
      },
    ]);
    await tx.insert(materials).values([
      {
        id: ids.materialBlack,
        code: 'DEMO-PLA-BLACK',
        name: '演示 PLA 黑色',
        materialType: 'PLA',
        colorName: '曜石黑',
        colorHex: '#18181B',
        stockGrams: '5000.00',
        safetyGrams: '500.00',
        wasteRate: '0.0500',
        supplier: '演示供应商',
      },
      {
        id: ids.materialWhite,
        code: 'DEMO-PLA-WHITE',
        name: '演示 PLA 白色',
        materialType: 'PLA',
        colorName: '象牙白',
        colorHex: '#F5F5F4',
        stockGrams: '3000.00',
        safetyGrams: '300.00',
        wasteRate: '0.1000',
        supplier: '演示供应商',
      },
      {
        id: ids.materialBlue,
        code: 'DEMO-PETG-BLUE',
        name: '演示 PETG 蓝色（不足）',
        materialType: 'PETG',
        colorName: '海洋蓝',
        colorHex: '#2563EB',
        stockGrams: '15.00',
        safetyGrams: '0.00',
        wasteRate: '0.0000',
      },
      {
        id: ids.materialLow,
        code: 'DEMO-PLA-LOW',
        name: '演示 PLA 低库存',
        materialType: 'PLA',
        colorName: '警示橙',
        colorHex: '#F97316',
        stockGrams: '100.00',
        safetyGrams: '200.00',
        wasteRate: '0.0500',
      },
    ]);
    await tx.insert(products).values([
      {
        id: ids.productLamp,
        categoryId: ids.categoryDesk,
        name: '几何氛围灯',
        slug: 'demo-geometric-lamp',
        subtitle: '多耗材 BOM 与完整订单链路演示商品',
        description: '使用黑白两种 PLA 按单打印的演示商品。',
        status: 'on_sale',
        isFeatured: true,
        sortOrder: 100,
        minPrice: '129.00',
        specs: { process: 'FDM', usage: '仅供 v0.1 测试' },
      },
      {
        id: ids.productSoldOut,
        categoryId: ids.categoryDecor,
        name: '海浪花瓶（售罄演示）',
        slug: 'demo-sold-out-vase',
        subtitle: '关联耗材不足，前台应显示售罄',
        status: 'on_sale',
        minPrice: '89.00',
      },
      {
        id: ids.productDraft,
        categoryId: ids.categoryDecor,
        name: '机械摆件（草稿演示）',
        slug: 'demo-draft-figure',
        subtitle: '后台草稿状态演示',
        status: 'draft',
        minPrice: '59.00',
      },
    ]);
    await tx.insert(productVariants).values([
      {
        id: ids.variantLampSmall,
        productId: ids.productLamp,
        skuCode: 'DEMO-LAMP-SMALL',
        name: '小号 / 黑色',
        attributes: { size: '小号', color: '黑色', material: 'PLA' },
        price: '129.00',
        weightGrams: '300.00',
        printHours: '3.50',
      },
      {
        id: ids.variantLampLarge,
        productId: ids.productLamp,
        skuCode: 'DEMO-LAMP-LARGE',
        name: '大号 / 黑白拼色',
        attributes: { size: '大号', color: '黑白拼色', material: 'PLA' },
        price: '199.00',
        comparePrice: '229.00',
        weightGrams: '600.00',
        printHours: '6.00',
      },
      {
        id: ids.variantSoldOut,
        productId: ids.productSoldOut,
        skuCode: 'DEMO-VASE-BLUE',
        name: '标准款 / 海洋蓝',
        attributes: { color: '海洋蓝', material: 'PETG' },
        price: '89.00',
        weightGrams: '250.00',
      },
      {
        id: ids.variantDraft,
        productId: ids.productDraft,
        skuCode: 'DEMO-FIGURE-DRAFT',
        name: '未发布款',
        price: '59.00',
      },
    ]);
    await tx.insert(variantMaterials).values([
      {
        variantId: ids.variantLampSmall,
        materialId: ids.materialBlack,
        grams: '80.00',
      },
      {
        variantId: ids.variantLampLarge,
        materialId: ids.materialBlack,
        grams: '100.00',
      },
      {
        variantId: ids.variantLampLarge,
        materialId: ids.materialWhite,
        grams: '20.00',
        sortOrder: 1,
      },
      {
        variantId: ids.variantSoldOut,
        materialId: ids.materialBlue,
        grams: '20.00',
      },
      {
        variantId: ids.variantDraft,
        materialId: ids.materialLow,
        grams: '30.00',
      },
    ]);
    await tx.insert(promotions).values([
      {
        id: ids.promotionFixed,
        name: '演示满百减二十',
        discountType: 'fixed_amount',
        discountValue: '20.00',
        minOrderAmount: '100.00',
      },
      {
        id: ids.promotionPercent,
        name: '演示九折',
        discountType: 'percentage',
        discountValue: '0.90',
        maxDiscountAmount: '50.00',
      },
      {
        id: ids.promotionShipping,
        name: '演示包邮',
        discountType: 'free_shipping',
        discountValue: '0.00',
      },
    ]);
    await tx.insert(discountCodes).values([
      {
        id: ids.codeFixed,
        promotionId: ids.promotionFixed,
        code: 'DEMO20',
        codeType: 'limited',
        maxUses: 100,
        perUserLimit: 1,
      },
      {
        id: ids.codePercent,
        promotionId: ids.promotionPercent,
        code: 'DEMO90',
        codeType: 'permanent',
        perUserLimit: 2,
      },
      {
        id: ids.codeShipping,
        promotionId: ids.promotionShipping,
        code: 'DEMOSHIP',
        codeType: 'limited',
        maxUses: 50,
      },
    ]);
    await tx.insert(shippingRules).values({
      id: ids.shipping,
      name: '演示广东运费',
      provinceCodes: ['440000'],
      firstWeightGrams: '1000.00',
      firstAmount: '8.00',
      additionalWeightGrams: '500.00',
      additionalAmount: '3.00',
      freeThreshold: '199.00',
      sortOrder: 0,
    });
    await tx.insert(userProfiles).values([
      {
        id: ids.userOne,
        email: 'demo.customer.a@example.test',
        phone: '19900000001',
        nickname: '演示用户甲',
        lastLoginAt: new Date(),
      },
      {
        id: ids.userTwo,
        email: 'demo.customer.b@example.test',
        phone: '19900000002',
        nickname: '演示用户乙',
        lastLoginAt: new Date(Date.now() - 86_400_000),
      },
      {
        id: ids.userDisabled,
        email: 'demo.customer.disabled@example.test',
        phone: '19900000003',
        nickname: '已停用演示用户',
        status: 'disabled',
      },
    ]);
    await tx.insert(addresses).values([
      {
        id: ids.addressOne,
        userId: ids.userOne,
        receiverName: '演示用户甲',
        receiverPhone: '19900000001',
        province: '广东省',
        provinceCode: '440000',
        city: '深圳市',
        district: '南山区',
        detail: '演示路 1 号（虚构地址）',
        isDefault: true,
      },
      {
        id: ids.addressTwo,
        userId: ids.userTwo,
        receiverName: '演示用户乙',
        receiverPhone: '19900000002',
        province: '广东省',
        provinceCode: '440000',
        city: '广州市',
        district: '天河区',
        detail: '测试大道 2 号（虚构地址）',
        isDefault: true,
      },
    ]);
    await tx.insert(carts).values({ id: ids.cart, userId: ids.userOne });
    await tx.insert(cartItems).values({
      id: ids.cartItem,
      cartId: ids.cart,
      variantId: ids.variantLampSmall,
      quantity: 2,
    });

    for (const [index, [, status]] of orderDefinitions.entries()) {
      await createDemoOrder(tx, index + 1, status);
    }
    await tx.insert(adminOperationLogs).values({
      adminId: ids.admin,
      adminName: 'v0.1 演示运营',
      action: 'demo.seed',
      targetType: 'demo_dataset',
      targetId: 'v0.1',
      payload: { orderCount: orderDefinitions.length },
      ip: '127.0.0.1',
    });
  });
}

async function verifyDemoData(): Promise<void> {
  const db = getDb();
  const [materialRows, productRows, userRows, orderRows, paymentRows] =
    await Promise.all([
      db
        .select({
          id: materials.id,
          stockGrams: materials.stockGrams,
          reservedGrams: materials.reservedGrams,
        })
        .from(materials)
        .where(inArray(materials.id, demoMaterialIds)),
      db
        .select({ id: products.id })
        .from(products)
        .where(inArray(products.id, demoProductIds)),
      db
        .select({ id: userProfiles.id, email: userProfiles.email })
        .from(userProfiles)
        .where(inArray(userProfiles.id, demoUserIds)),
      db
        .select({ id: orders.id, status: orders.status })
        .from(orders)
        .where(inArray(orders.id, demoOrderIds)),
      db
        .select({ orderId: payments.orderId })
        .from(payments)
        .where(inArray(payments.orderId, demoOrderIds)),
    ]);
  assert.equal(materialRows.length, 4, '演示耗材数量不正确');
  assert.equal(productRows.length, 3, '演示商品数量不正确');
  assert.equal(userRows.length, 3, '演示用户数量不正确');
  assert(
    userRows.every((user) => user.email?.endsWith('@example.test')),
    '演示用户邮箱未完整创建',
  );
  assert.equal(orderRows.length, 9, '演示订单数量不正确');
  assert.equal(paymentRows.length, 9, '演示支付记录数量不正确');
  assert.deepEqual(
    new Set(orderRows.map((order) => order.status)),
    new Set(orderDefinitions.map(([, status]) => status)),
    '演示订单状态覆盖不完整',
  );
  const black = materialRows.find((item) => item.id === ids.materialBlack);
  const white = materialRows.find((item) => item.id === ids.materialWhite);
  assert.equal(black?.stockGrams, '4370.00');
  assert.equal(black?.reservedGrams, '105.00');
  assert.equal(white?.stockGrams, '2868.00');
  assert.equal(white?.reservedGrams, '22.00');
  const [discount] = await db
    .select({ usedCount: discountCodes.usedCount })
    .from(discountCodes)
    .where(eq(discountCodes.id, ids.codeFixed));
  assert.equal(discount?.usedCount, 1, '演示折扣码占用次数不正确');
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? 'seed';
  if (!['seed', 'reset', 'check'].includes(mode)) {
    throw new Error('Usage: demo-data.ts [seed|reset|check]');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    process.env.ALLOW_DEMO_DATA !== 'true'
  ) {
    throw new Error(
      'Production demo data is blocked. Set ALLOW_DEMO_DATA=true only in an isolated validation environment.',
    );
  }
  try {
    if (mode === 'reset') {
      await getDb().transaction(resetDemoData);
      process.stdout.write(
        'v0.2.0 demo data removed; previous site settings restored.\n',
      );
      return;
    }
    if (mode === 'check') {
      await verifyDemoData();
      process.stdout.write(
        'v0.2.0 demo data check passed: user emails, relations, status coverage, inventory, reservations, payments, and discount usage are consistent.\n',
      );
      return;
    }
    const password =
      process.env.DEMO_ADMIN_PASSWORD ?? randomBytes(18).toString('base64url');
    if (password.length < 8 || password.length > 72) {
      throw new Error('DEMO_ADMIN_PASSWORD must contain 8 to 72 characters.');
    }
    await seedDemoData(await bcrypt.hash(password, 12));
    await verifyDemoData();
    process.stdout.write(
      [
        'v0.2.0 demo data is ready.',
        'Admin URL: http://localhost:5003/admin/login',
        'Username: demo_operator',
        `Password: ${password}`,
        'All customer emails, phones, addresses, payment IDs, and tracking numbers are fictional.',
      ].join('\n') + '\n',
    );
  } finally {
    await closeDatabaseConnection();
  }
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`Demo data command failed: ${message}\n`);
  process.exitCode = 1;
});
