import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

import { ProductGallery } from '@/components/shop/product-gallery';
import { ProductPurchasePanel } from '@/components/shop/product-purchase-panel';
import { BizError } from '@/lib/errors';
import { getProductSpecLabel } from '@/lib/display-labels';
import { absoluteSiteUrl, serializeJsonLd } from '@/lib/seo';
import { getStorefrontProductBySlug } from '@/lib/services/storefront.service';
import { zhCN } from '@/messages/zh-CN';

export const revalidate = 60;

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams(): Array<{ slug: string }> {
  return [];
}

async function findProduct(slug: string) {
  try {
    return await getStorefrontProductBySlug(slug);
  } catch (error: unknown) {
    if (error instanceof BizError && error.code === 40402) return undefined;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await findProduct(slug);
  if (!product) return { title: '商品不存在' };
  const description =
    product.subtitle ?? `${product.name}，按单生产的电子阅读器保护壳。`;
  const url = absoluteSiteUrl(`/products/${product.slug}`);
  return {
    title: product.name,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: `${product.name}｜${zhCN.brand.name}`,
      description,
      images: product.mainImageUrl ? [product.mainImageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await findProduct(slug);
  if (!product) notFound();

  const images = [product.mainImageUrl, ...product.gallery].filter(
    (image): image is string => Boolean(image),
  );
  const uniqueImages = [...new Set(images)];
  const productUrl = absoluteSiteUrl(`/products/${product.slug}`);
  const description =
    product.subtitle ?? `${product.name}，按单生产的电子阅读器保护壳。`;
  const breadcrumbItems = [
    { name: '首页', url: absoluteSiteUrl('/') },
    { name: '全部机型', url: absoluteSiteUrl('/products') },
    ...(product.categoryName && product.categorySlug
      ? [
          {
            name: product.categoryName,
            url: absoluteSiteUrl(`/category/${product.categorySlug}`),
          },
        ]
      : []),
    { name: product.name, url: productUrl },
  ];
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      description,
      image: uniqueImages,
      url: productUrl,
      brand: { '@type': 'Brand', name: zhCN.brand.name },
      offers: product.variants.map((variant) => ({
        '@type': 'Offer',
        url: productUrl,
        sku: variant.skuCode,
        name: variant.name,
        price: variant.price,
        priceCurrency: 'CNY',
        availability: 'https://schema.org/InStock',
        itemCondition: 'https://schema.org/NewCondition',
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbItems.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: item.url,
      })),
    },
  ];
  const ModelPreviewLauncher = product.modelPreviewUrl
    ? (await import('@/components/shop/model-preview-launcher'))
        .ModelPreviewLauncher
    : undefined;

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
        <nav
          aria-label="面包屑"
          className="flex flex-wrap items-center gap-2 text-xs text-stone-400"
        >
          <Link href="/" className="hover:text-stone-800">
            首页
          </Link>
          <span>/</span>
          <Link href="/products" className="hover:text-stone-800">
            全部机型
          </Link>
          {product.categoryName && product.categorySlug ? (
            <>
              <span>/</span>
              <Link
                href={`/category/${product.categorySlug}`}
                className="hover:text-stone-800"
              >
                {product.categoryName}
              </Link>
            </>
          ) : null}
          <span>/</span>
          <span className="text-stone-600">{product.name}</span>
        </nav>
      </div>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-24">
        <div className="relative">
          <ProductGallery productName={product.name} images={uniqueImages} />
          {product.modelPreviewUrl && ModelPreviewLauncher ? (
            <ModelPreviewLauncher
              modelUrl={product.modelPreviewUrl}
              productName={product.name}
            />
          ) : null}
        </div>
        <div className="lg:pt-6">
          <p className="text-store-muted text-xs font-bold tracking-[0.2em]">
            按单生产
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
            {product.name}
          </h1>
          {product.subtitle ? (
            <p className="mt-5 text-base leading-8 text-stone-500">
              {product.subtitle}
            </p>
          ) : null}
          <div className="mt-8 border-t border-stone-900/8 pt-8">
            <ProductPurchasePanel
              productName={product.name}
              slug={product.slug}
              variants={product.variants}
            />
          </div>
        </div>
      </section>

      <section className="border-y border-stone-900/8 bg-white/55">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[1.35fr_0.65fr] lg:gap-20">
          <div>
            <p className="text-store-muted text-xs font-bold tracking-[0.2em]">
              作品故事
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em]">
              作品详情
            </h2>
            {product.description ? (
              <div className="product-markdown mt-8 max-w-none leading-8 text-stone-600">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeSanitize]}
                >
                  {product.description}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="mt-8 text-sm leading-7 text-stone-500">
                该作品的详细介绍正在整理中。
              </p>
            )}
          </div>
          <div>
            <p className="text-store-muted text-xs font-bold tracking-[0.2em]">
              规格参数
            </p>
            <h2 className="mt-3 text-2xl font-semibold">作品参数</h2>
            <dl className="mt-7 divide-y divide-stone-900/8 border-y border-stone-900/8 text-sm">
              {Object.entries(product.specs).map(([name, value]) => (
                <div
                  key={name}
                  className="grid grid-cols-[7rem_1fr] gap-4 py-4"
                >
                  <dt className="text-stone-400">
                    {getProductSpecLabel(name)}
                  </dt>
                  <dd className="text-right font-medium text-stone-700">
                    {value}
                  </dd>
                </div>
              ))}
              <div className="grid grid-cols-[7rem_1fr] gap-4 py-4">
                <dt className="text-stone-400">生产方式</dt>
                <dd className="text-right font-medium text-stone-700">
                  按单生产
                </dd>
              </div>
              <div className="grid grid-cols-[7rem_1fr] gap-4 py-4">
                <dt className="text-stone-400">预计发货</dt>
                <dd className="text-right font-medium text-stone-700">
                  {zhCN.commerce.deliveryExpected}
                </dd>
              </div>
            </dl>
            <div className="bg-store-mist mt-8 rounded-2xl p-5 text-sm leading-7 text-stone-600">
              <h3 className="font-semibold text-stone-900">配送与售后</h3>
              <p className="mt-2">{zhCN.commerce.afterSales}</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
