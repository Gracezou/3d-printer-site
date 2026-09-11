export interface DeviceSeedBrand {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  sortOrder: number;
  isVisible: boolean;
}

export interface DeviceSeedModel {
  id: string;
  brandSlug: string;
  name: string;
  slug: string;
  aliases: string[];
  releaseYear: number;
  isDiscontinued: boolean;
  isMolded: boolean;
  dimensions: {
    widthMm: number;
    heightMm: number;
    thicknessMm: number;
    weightGrams: number;
  };
  compatGroup: string | null;
  notes: string;
  sourceUrl: string;
  sourceLabel: string;
  sortOrder: number;
  isVisible: boolean;
}

export const deviceSeedBrands: DeviceSeedBrand[] = [
  {
    id: '22000000-0000-4000-8000-000000000001',
    name: '阅星瞳',
    slug: 'xteink',
    aliases: ['阅星曈', 'XTEINK', '小鼻嘎'],
    sortOrder: 10,
    isVisible: true,
  },
  {
    id: '22000000-0000-4000-8000-000000000002',
    name: 'Kindle',
    slug: 'kindle',
    aliases: ['亚马逊 Kindle', 'Amazon Kindle'],
    sortOrder: 20,
    isVisible: true,
  },
  {
    id: '22000000-0000-4000-8000-000000000003',
    name: '掌阅',
    slug: 'ireader',
    aliases: ['iReader', '掌阅 iReader'],
    sortOrder: 30,
    isVisible: true,
  },
  {
    id: '22000000-0000-4000-8000-000000000004',
    name: '文石 / BOOX',
    slug: 'boox',
    aliases: ['文石', 'BOOX', 'Onyx BOOX'],
    sortOrder: 40,
    isVisible: true,
  },
];

export const deviceSeedModels: DeviceSeedModel[] = [
  {
    id: '22000000-0000-4000-8000-000000000101',
    brandSlug: 'xteink',
    name: 'X4 Classic（X4 V2）',
    slug: 'x4-classic-v2',
    aliases: ['X4 Classic', 'X4 V2', 'X4二代'],
    releaseYear: 2026,
    isDiscontinued: false,
    isMolded: false,
    dimensions: {
      widthMm: 69,
      heightMm: 114,
      thicknessMm: 4.9,
      weightGrams: 68,
    },
    compatGroup: null,
    notes:
      '4.3 英寸版本，使用 Pogo Pin 磁吸充电。开模前必须用实机复核按键、屏幕开口、磁吸环与充电触点位置。',
    sourceUrl:
      'https://www.xteink.com/products/xteink-x4-classic-pocket-ereader',
    sourceLabel: 'XTEINK 官方产品页',
    sortOrder: 10,
    isVisible: true,
  },
  {
    id: '22000000-0000-4000-8000-000000000102',
    brandSlug: 'kindle',
    name: 'Paperwhite（第 11 代，2021）',
    slug: 'paperwhite-11th-2021',
    aliases: ['Paperwhite 5', 'PW5', 'KPW5', '第十一代 Paperwhite'],
    releaseYear: 2021,
    isDiscontinued: true,
    isMolded: false,
    dimensions: {
      widthMm: 124.6,
      heightMm: 174.2,
      thicknessMm: 8.1,
      weightGrams: 205,
    },
    compatGroup: 'kindle-paperwhite-11-2021',
    notes:
      '6.8 英寸 USB-C 版本。标准版与 Signature Edition 外形接近，但开模前仍须按具体设备型号和实机逐项复核。',
    sourceUrl:
      'https://www.amazon.com/gp/help/customer/display.html?nodeId=GK33S847NN4V6Y83',
    sourceLabel: 'Amazon Kindle 官方机型识别页',
    sortOrder: 20,
    isVisible: true,
  },
  {
    id: '22000000-0000-4000-8000-000000000103',
    brandSlug: 'ireader',
    name: 'Ocean 4 Turbo（2025）',
    slug: 'ocean-4-turbo-2025',
    aliases: ['Ocean4 Turbo 2025', 'Ocean 4T 2025', 'O4T 2025'],
    releaseYear: 2025,
    isDiscontinued: false,
    isMolded: false,
    dimensions: {
      widthMm: 136,
      heightMm: 154.2,
      thicknessMm: 7.8,
      weightGrams: 179,
    },
    compatGroup: null,
    notes:
      '7 英寸人体工学握持版本，最薄处约 4 mm、厚处约 7.8 mm。尺寸存在曲面厚度差，必须扫描实机后开模。',
    sourceUrl: 'https://detail.zol.com.cn/ebook/index2114646.shtml',
    sourceLabel: '中关村在线产品参数页（基于官方发布信息）',
    sortOrder: 30,
    isVisible: true,
  },
  {
    id: '22000000-0000-4000-8000-000000000104',
    brandSlug: 'boox',
    name: 'Go 7',
    slug: 'go-7',
    aliases: ['BOOX Go7', '文石 Go 7', 'Go7 黑白版'],
    releaseYear: 2025,
    isDiscontinued: false,
    isMolded: false,
    dimensions: {
      widthMm: 137,
      heightMm: 156,
      thicknessMm: 6.4,
      weightGrams: 195,
    },
    compatGroup: 'boox-go-7-series',
    notes:
      '7 英寸黑白版本，带实体翻页键、USB-C 与 microSD 卡槽。官方保护套同时标注兼容 Go Color 7 系列，但第三方壳开模仍须实机确认。',
    sourceUrl: 'https://shop.boox.com/products/go7',
    sourceLabel: 'BOOX 官方产品页',
    sortOrder: 40,
    isVisible: true,
  },
];

export function validateDeviceSeedData(): string[] {
  const errors: string[] = [];
  const brandSlugs = new Set<string>();
  const modelKeys = new Set<string>();

  for (const brand of deviceSeedBrands) {
    if (brandSlugs.has(brand.slug))
      errors.push(`品牌 Slug 重复：${brand.slug}`);
    brandSlugs.add(brand.slug);
  }

  for (const model of deviceSeedModels) {
    const key = `${model.brandSlug}/${model.slug}`;
    if (!brandSlugs.has(model.brandSlug)) errors.push(`机型品牌不存在：${key}`);
    if (modelKeys.has(key)) errors.push(`机型路径重复：${key}`);
    modelKeys.add(key);
    if (!model.sourceUrl.startsWith('https://'))
      errors.push(`来源地址必须使用 HTTPS：${key}`);
    if (!model.notes.trim()) errors.push(`机型说明为空：${key}`);
    if (Object.values(model.dimensions).some((value) => value <= 0)) {
      errors.push(`机型尺寸必须为正数：${key}`);
    }
  }

  return errors;
}
