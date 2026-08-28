import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { cache } from 'react';

import { getDb } from '@/lib/db/client';
import { categories, products, settings } from '@/lib/db/schema';

export interface StorefrontBanner {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkUrl: string;
  buttonText: string;
}

export interface StorefrontSiteInfo {
  name: string;
  description: string;
  contact: string;
  about: string;
}

export interface StorefrontProduct {
  id: string;
  name: string;
  slug: string;
  subtitle: string | null;
  mainImageUrl: string | null;
  minPrice: string | null;
  isSoldOut: boolean;
}

const defaultBanner: StorefrontBanner = {
  title: '把灵感，打印成触手可及的作品',
  subtitle:
    '精选设计，按单生产。每一件作品都从一层材料开始，认真抵达你的手中。',
  imageUrl: null,
  linkUrl: '/products',
  buttonText: '浏览全部作品',
};

const defaultSiteInfo: StorefrontSiteInfo = {
  name: '层光造物',
  description: '专注有趣、耐看的 3D 打印成品，按单生产，认真交付。',
  contact: '工作日 09:00–18:00',
  about:
    '我们从数字模型出发，用稳定的材料与细致的打印工艺，让好设计成为日常生活的一部分。',
};

function toString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function parseBanners(value: unknown): StorefrontBanner[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    const title = toString(record.title);
    if (!title) return [];
    return [
      {
        title,
        subtitle: toString(record.subtitle) ?? '',
        imageUrl: toString(record.imageUrl) ?? null,
        linkUrl: toString(record.linkUrl) ?? '/products',
        buttonText: toString(record.buttonText) ?? '查看详情',
      },
    ];
  });
}

function parseSiteInfo(value: unknown): StorefrontSiteInfo {
  if (typeof value !== 'object' || value === null) return defaultSiteInfo;
  const record = value as Record<string, unknown>;
  return {
    name: toString(record.name) ?? defaultSiteInfo.name,
    description: toString(record.description) ?? defaultSiteInfo.description,
    contact: toString(record.contact) ?? defaultSiteInfo.contact,
    about: toString(record.about) ?? defaultSiteInfo.about,
  };
}

const productSelection = {
  id: products.id,
  name: products.name,
  slug: products.slug,
  subtitle: products.subtitle,
  mainImageUrl: products.mainImageUrl,
  minPrice: products.minPrice,
  isSoldOut: sql<boolean>`NOT EXISTS (
    SELECT 1
    FROM product_variants variant
    INNER JOIN v_variant_availability availability
      ON availability.variant_id = variant.id
    WHERE variant.product_id = ${products.id}
      AND variant.is_active = true
      AND availability.available_qty > 0
  )`.as('is_sold_out'),
};

async function loadHomePageData() {
  const db = getDb();
  const onSaleFilter = and(
    eq(products.status, 'on_sale'),
    isNull(products.deletedAt),
  );

  const [settingRows, categoryRows, featuredProducts, newestProducts] =
    await Promise.all([
      db
        .select({ key: settings.key, value: settings.value })
        .from(settings)
        .where(sql`${settings.key} IN ('site_banners', 'site_info')`),
      db
        .select({
          id: categories.id,
          name: categories.name,
          slug: categories.slug,
          imageUrl: categories.imageUrl,
        })
        .from(categories)
        .where(and(eq(categories.isVisible, true), isNull(categories.parentId)))
        .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
      db
        .select(productSelection)
        .from(products)
        .where(and(onSaleFilter, eq(products.isFeatured, true)))
        .orderBy(desc(products.sortOrder), desc(products.createdAt))
        .limit(12),
      db
        .select(productSelection)
        .from(products)
        .where(onSaleFilter)
        .orderBy(desc(products.createdAt))
        .limit(8),
    ]);

  const settingValues = new Map(
    settingRows.map((setting) => [setting.key, setting.value]),
  );
  const banners = parseBanners(settingValues.get('site_banners'));

  return {
    banners: banners.length > 0 ? banners : [defaultBanner],
    siteInfo: parseSiteInfo(settingValues.get('site_info')),
    categories: categoryRows,
    featuredProducts,
    newestProducts,
  };
}

export const getHomePageData = cache(loadHomePageData);
