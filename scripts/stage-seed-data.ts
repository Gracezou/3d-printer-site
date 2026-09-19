import type { DeviceSeedModel } from './device-catalog-data';

export interface StageMaterialSeed {
  id: string;
  code: string;
  name: string;
  materialType: 'PLA' | 'PETG' | 'TPU';
  colorName: string;
  colorHex: string;
  stockGrams: string;
  safetyGrams: string;
  unitCostPerKg: string;
  wasteRate: string;
}

export interface StageVariantSeed {
  id: string;
  skuCode: string;
  name: string;
  attributes: Record<string, string>;
  price: string;
  comparePrice: string | null;
  weightGrams: string;
  printHours: string;
  materialCode: string;
  materialGrams: string;
}

export interface StageProductSeed {
  id: string;
  slug: string;
  name: string;
  subtitle: string;
  description: string;
  specs: Record<string, string>;
  minPrice: string;
  sortOrder: number;
  isFeatured: boolean;
  device: { brandSlug: string; modelSlug: string };
  variants: StageVariantSeed[];
}

export interface StagePromotionSeed {
  id: string;
  codeId: string;
  code: string;
  name: string;
  discountType: 'fixed_amount' | 'percentage' | 'free_shipping';
  discountValue: string;
  minOrderAmount: string;
  maxDiscountAmount: string | null;
  maxUses: number;
}

export const stageMaterials: StageMaterialSeed[] = [
  {
    id: '33000000-0000-4000-8000-000000000001',
    code: 'STAGE-PETG-MATTE-BLACK',
    name: 'PETG 哑光黑',
    materialType: 'PETG',
    colorName: '哑光黑',
    colorHex: '#202124',
    stockGrams: '5000.00',
    safetyGrams: '500.00',
    unitCostPerKg: '85.00',
    wasteRate: '0.0800',
  },
  {
    id: '33000000-0000-4000-8000-000000000002',
    code: 'STAGE-PETG-IVORY',
    name: 'PETG 象牙白',
    materialType: 'PETG',
    colorName: '象牙白',
    colorHex: '#F2EBDD',
    stockGrams: '4000.00',
    safetyGrams: '400.00',
    unitCostPerKg: '88.00',
    wasteRate: '0.0800',
  },
  {
    id: '33000000-0000-4000-8000-000000000003',
    code: 'STAGE-PETG-OCEAN-BLUE',
    name: 'PETG 海洋蓝',
    materialType: 'PETG',
    colorName: '海洋蓝',
    colorHex: '#315C7D',
    stockGrams: '3500.00',
    safetyGrams: '350.00',
    unitCostPerKg: '92.00',
    wasteRate: '0.0800',
  },
  {
    id: '33000000-0000-4000-8000-000000000004',
    code: 'STAGE-TPU-BLACK',
    name: 'TPU 柔韧黑',
    materialType: 'TPU',
    colorName: '柔韧黑',
    colorHex: '#171717',
    stockGrams: '3000.00',
    safetyGrams: '300.00',
    unitCostPerKg: '128.00',
    wasteRate: '0.1000',
  },
  {
    id: '33000000-0000-4000-8000-000000000005',
    code: 'STAGE-TPU-ORANGE',
    name: 'TPU 活力橙',
    materialType: 'TPU',
    colorName: '活力橙',
    colorHex: '#D96C2F',
    stockGrams: '2500.00',
    safetyGrams: '250.00',
    unitCostPerKg: '135.00',
    wasteRate: '0.1000',
  },
  {
    id: '33000000-0000-4000-8000-000000000006',
    code: 'STAGE-PLA-PROTOTYPE-GRAY',
    name: 'PLA 打样灰',
    materialType: 'PLA',
    colorName: '打样灰',
    colorHex: '#80868B',
    stockGrams: '3000.00',
    safetyGrams: '300.00',
    unitCostPerKg: '68.00',
    wasteRate: '0.0600',
  },
  {
    id: '33000000-0000-4000-8000-000000000007',
    code: 'STAGE-PLA-MATTE-WHITE',
    name: 'PLA 哑光白',
    materialType: 'PLA',
    colorName: '哑光白',
    colorHex: '#F4F4F1',
    stockGrams: '3000.00',
    safetyGrams: '300.00',
    unitCostPerKg: '72.00',
    wasteRate: '0.0600',
  },
];

// X3 is catalogued on release-v0.2.3 (e9c9b11) but not yet in the v0.3.0
// device seed; stage carries it with the same id and slug so a later merge
// upserts the same row.
export const stageExtraDeviceModels: DeviceSeedModel[] = [
  {
    id: '22000000-0000-4000-8000-000000000105',
    brandSlug: 'xteink',
    name: 'X3',
    slug: 'x3',
    aliases: ['XTEINK X3', '阅星瞳 X3', '小鼻嘎 X3'],
    releaseYear: 2026,
    isDiscontinued: false,
    isMolded: false,
    dimensions: {
      widthMm: 63.7,
      heightMm: 97.6,
      thicknessMm: 5.1,
      weightGrams: 58,
    },
    compatGroup: null,
    notes:
      '3.7 英寸版本，带实体翻页键、NFC 与磁吸 Pogo Pin 充电。保护壳尚未完成销售参数配置；正式开模和上架前必须用实机复核按键、卡槽、磁吸件与充电触点位置。',
    sourceUrl: 'https://www.xteink.com/products/xteink-x3',
    sourceLabel: 'XTEINK 官方产品页',
    sortOrder: 5,
    isVisible: true,
  },
];

export const stageProducts: StageProductSeed[] = [
  {
    // Mirrors the X3 feasibility item published on release-v0.2.3 (d25ba5f).
    id: '33000000-0000-4000-8000-000000000105',
    slug: 'xteink-x3-protective-case',
    name: '适用于阅星瞳 X3 的保护壳',
    subtitle: '基础款 · 哑光白 PLA · 保留翻页键与磁吸充电位',
    description:
      '适用于阅星瞳 X3 的第三方 3D 打印保护壳。下单后按单打印，装机复核后发出，7 个自然日内发出。',
    specs: {
      适配机型: '阅星瞳 X3',
      设备尺寸: '97.6 × 63.7 × 5.1 mm',
      材质: 'PLA',
      制作方式: '按单 3D 打印',
      交期: '7 个自然日内发出',
    },
    minPrice: '39.90',
    sortOrder: 110,
    isFeatured: true,
    device: { brandSlug: 'xteink', modelSlug: 'x3' },
    variants: [
      {
        id: '33000000-0000-4000-8000-000000000209',
        skuCode: 'CASE-X3-PLA-WHT',
        name: '基础款 · 哑光白',
        attributes: { 款式: '基础款', 颜色: '哑光白', material: 'PLA' },
        price: '39.90',
        comparePrice: '49.90',
        weightGrams: '32.00',
        printHours: '2.50',
        materialCode: 'STAGE-PLA-MATTE-WHITE',
        materialGrams: '35.00',
      },
    ],
  },
  {
    id: '33000000-0000-4000-8000-000000000101',
    slug: 'xteink-x4-classic-v2-case',
    name: '适用于阅星瞳 X4 Classic（X4 V2）的保护壳',
    subtitle: '轻巧贴合，保留磁吸充电与按键开口',
    description:
      '按单 3D 打印的电子阅读器保护壳。下单后按对应实机结构制作，7 个自然日内发出。',
    specs: {
      适配机型: '阅星瞳 X4 Classic（X4 V2）',
      制作方式: '按单 3D 打印',
      交期: '7 个自然日内发出',
    },
    minPrice: '49.90',
    sortOrder: 100,
    isFeatured: true,
    device: { brandSlug: 'xteink', modelSlug: 'x4-classic-v2' },
    variants: [
      {
        id: '33000000-0000-4000-8000-000000000201',
        skuCode: 'CASE-X4V2-PETG-BLK',
        name: 'PETG / 哑光黑',
        attributes: { material: 'PETG', color: '哑光黑' },
        price: '49.90',
        comparePrice: null,
        weightGrams: '42.00',
        printHours: '2.50',
        materialCode: 'STAGE-PETG-MATTE-BLACK',
        materialGrams: '42.00',
      },
      {
        id: '33000000-0000-4000-8000-000000000202',
        skuCode: 'CASE-X4V2-TPU-ORG',
        name: 'TPU / 活力橙',
        attributes: { material: 'TPU', color: '活力橙' },
        price: '59.90',
        comparePrice: null,
        weightGrams: '45.00',
        printHours: '3.00',
        materialCode: 'STAGE-TPU-ORANGE',
        materialGrams: '45.00',
      },
    ],
  },
  {
    id: '33000000-0000-4000-8000-000000000102',
    slug: 'kindle-paperwhite-11-2021-case',
    name: '适用于 Kindle Paperwhite（第 11 代）的保护壳',
    subtitle: '为 2021 款 6.8 英寸机型按单制作',
    description:
      '覆盖边角并保留 USB-C 接口的轻量保护壳。请在下单前核对机型代际，7 个自然日内发出。',
    specs: {
      适配机型: 'Kindle Paperwhite（第 11 代，2021）',
      制作方式: '按单 3D 打印',
      交期: '7 个自然日内发出',
    },
    minPrice: '69.90',
    sortOrder: 90,
    isFeatured: true,
    device: { brandSlug: 'kindle', modelSlug: 'paperwhite-11th-2021' },
    variants: [
      {
        id: '33000000-0000-4000-8000-000000000203',
        skuCode: 'CASE-PW11-PETG-IVR',
        name: 'PETG / 象牙白',
        attributes: { material: 'PETG', color: '象牙白' },
        price: '69.90',
        comparePrice: '79.90',
        weightGrams: '68.00',
        printHours: '4.50',
        materialCode: 'STAGE-PETG-IVORY',
        materialGrams: '68.00',
      },
      {
        id: '33000000-0000-4000-8000-000000000204',
        skuCode: 'CASE-PW11-TPU-BLK',
        name: 'TPU / 柔韧黑',
        attributes: { material: 'TPU', color: '柔韧黑' },
        price: '79.90',
        comparePrice: null,
        weightGrams: '72.00',
        printHours: '5.00',
        materialCode: 'STAGE-TPU-BLACK',
        materialGrams: '72.00',
      },
    ],
  },
  {
    id: '33000000-0000-4000-8000-000000000103',
    slug: 'ireader-ocean-4-turbo-2025-case',
    name: '适用于掌阅 Ocean 4 Turbo（2025）的保护壳',
    subtitle: '适配人体工学握持曲面与翻页区',
    description:
      '针对 2025 款 Ocean 4 Turbo 曲面轮廓制作，保留接口与握持空间，7 个自然日内发出。',
    specs: {
      适配机型: '掌阅 Ocean 4 Turbo（2025）',
      制作方式: '按单 3D 打印',
      交期: '7 个自然日内发出',
    },
    minPrice: '79.90',
    sortOrder: 80,
    isFeatured: false,
    device: { brandSlug: 'ireader', modelSlug: 'ocean-4-turbo-2025' },
    variants: [
      {
        id: '33000000-0000-4000-8000-000000000205',
        skuCode: 'CASE-O4T25-PETG-BLU',
        name: 'PETG / 海洋蓝',
        attributes: { material: 'PETG', color: '海洋蓝' },
        price: '79.90',
        comparePrice: null,
        weightGrams: '75.00',
        printHours: '5.50',
        materialCode: 'STAGE-PETG-OCEAN-BLUE',
        materialGrams: '75.00',
      },
      {
        id: '33000000-0000-4000-8000-000000000206',
        skuCode: 'CASE-O4T25-TPU-BLK',
        name: 'TPU / 柔韧黑',
        attributes: { material: 'TPU', color: '柔韧黑' },
        price: '89.90',
        comparePrice: null,
        weightGrams: '80.00',
        printHours: '6.00',
        materialCode: 'STAGE-TPU-BLACK',
        materialGrams: '80.00',
      },
    ],
  },
  {
    id: '33000000-0000-4000-8000-000000000104',
    slug: 'boox-go-7-case',
    name: '适用于文石 BOOX Go 7 的保护壳',
    subtitle: '保留实体翻页键、USB-C 与卡槽开口',
    description:
      '为 BOOX Go 7 黑白版按单打印，兼顾边角保护与按键操作，7 个自然日内发出。',
    specs: {
      适配机型: '文石 BOOX Go 7',
      制作方式: '按单 3D 打印',
      交期: '7 个自然日内发出',
    },
    minPrice: '79.90',
    sortOrder: 70,
    isFeatured: false,
    device: { brandSlug: 'boox', modelSlug: 'go-7' },
    variants: [
      {
        id: '33000000-0000-4000-8000-000000000207',
        skuCode: 'CASE-GO7-PETG-BLK',
        name: 'PETG / 哑光黑',
        attributes: { material: 'PETG', color: '哑光黑' },
        price: '79.90',
        comparePrice: null,
        weightGrams: '78.00',
        printHours: '5.50',
        materialCode: 'STAGE-PETG-MATTE-BLACK',
        materialGrams: '78.00',
      },
      {
        id: '33000000-0000-4000-8000-000000000208',
        skuCode: 'CASE-GO7-TPU-ORG',
        name: 'TPU / 活力橙',
        attributes: { material: 'TPU', color: '活力橙' },
        price: '89.90',
        comparePrice: null,
        weightGrams: '82.00',
        printHours: '6.00',
        materialCode: 'STAGE-TPU-ORANGE',
        materialGrams: '82.00',
      },
    ],
  },
];

export const stagePromotions: StagePromotionSeed[] = [
  {
    id: '33000000-0000-4000-8000-000000000301',
    codeId: '33000000-0000-4000-8000-000000000401',
    code: 'STAGE20',
    name: 'Stage 满 99 减 20',
    discountType: 'fixed_amount',
    discountValue: '20.00',
    minOrderAmount: '99.00',
    maxDiscountAmount: null,
    maxUses: 100,
  },
  {
    id: '33000000-0000-4000-8000-000000000302',
    codeId: '33000000-0000-4000-8000-000000000402',
    code: 'STAGE90',
    name: 'Stage 九折',
    discountType: 'percentage',
    discountValue: '0.90',
    minOrderAmount: '59.00',
    maxDiscountAmount: '50.00',
    maxUses: 200,
  },
  {
    id: '33000000-0000-4000-8000-000000000303',
    codeId: '33000000-0000-4000-8000-000000000403',
    code: 'STAGESHIP',
    name: 'Stage 满 79 包邮',
    discountType: 'free_shipping',
    discountValue: '0.00',
    minOrderAmount: '79.00',
    maxDiscountAmount: null,
    maxUses: 100,
  },
];

export function validateStageSeedData(): string[] {
  const errors: string[] = [];
  const materialCodes = new Set(stageMaterials.map((item) => item.code));
  const productSlugs = new Set<string>();
  const skuCodes = new Set<string>();
  const discountCodes = new Set<string>();

  for (const product of stageProducts) {
    if (productSlugs.has(product.slug))
      errors.push(`商品 slug 重复：${product.slug}`);
    productSlugs.add(product.slug);
    if (product.variants.length === 0)
      errors.push(`商品没有规格：${product.slug}`);
    for (const variant of product.variants) {
      if (skuCodes.has(variant.skuCode))
        errors.push(`SKU 重复：${variant.skuCode}`);
      skuCodes.add(variant.skuCode);
      if (!materialCodes.has(variant.materialCode)) {
        errors.push(`SKU 引用了不存在的耗材：${variant.skuCode}`);
      }
    }
  }

  for (const promotion of stagePromotions) {
    if (discountCodes.has(promotion.code))
      errors.push(`折扣码重复：${promotion.code}`);
    discountCodes.add(promotion.code);
    if (
      promotion.discountType === 'percentage' &&
      (Number(promotion.discountValue) <= 0 ||
        Number(promotion.discountValue) >= 1)
    ) {
      errors.push(`百分比折扣率无效：${promotion.code}`);
    }
  }

  return errors;
}
