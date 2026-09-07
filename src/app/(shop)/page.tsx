import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { HeroCarousel } from '@/components/shop/hero-carousel';
import { ProductCard } from '@/components/shop/product-card';
import { getHomePageData } from '@/lib/services/storefront.service';

// The storefront reads live database data. Keeping it dynamic prevents database
// credentials from being required while the production image is being built.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '按单生产的 3D 打印作品',
  description: '探索精心制作的 3D 打印摆件、家居与创意作品，按单生产。',
  alternates: { canonical: '/' },
};

function SectionHeading({
  eyebrow,
  title,
  href,
}: {
  eyebrow: string;
  title: string;
  href: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-5 sm:mb-10">
      <div>
        <p className="text-xs font-bold tracking-[0.22em] text-[#59705f]">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {title}
        </h2>
      </div>
      <Link
        href={href}
        className="hidden items-center gap-2 border-b border-stone-900/20 pb-1 text-sm font-semibold transition hover:border-stone-900 sm:flex"
      >
        查看全部 <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

export default async function HomePage() {
  const data = await getHomePageData();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5003';
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: data.siteInfo.name,
      url: siteUrl,
      description: data.siteInfo.description,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: data.siteInfo.name,
      url: siteUrl,
      description: data.siteInfo.description,
      inLanguage: 'zh-CN',
      potentialAction: {
        '@type': 'SearchAction',
        target: `${siteUrl}/products?keyword={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
  ];

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll('<', '\\u003c'),
        }}
      />
      <HeroCarousel banners={data.banners} />

      <section
        aria-labelledby="category-heading"
        className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28"
      >
        <SectionHeading
          eyebrow="按分类探索"
          title="从喜欢的方向开始"
          href="/products"
        />
        <h2 id="category-heading" className="sr-only">
          商品分类
        </h2>
        {data.categories.length > 0 ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {data.categories.map((category, index) => (
              <Link
                key={category.id}
                href={`/category/${category.slug}`}
                className="group relative aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-[#e7e3d8] p-5 sm:p-7"
              >
                {category.imageUrl ? (
                  <div
                    role="img"
                    aria-label={category.name}
                    className="absolute inset-0 bg-cover bg-center transition duration-500 group-hover:scale-105"
                    style={{
                      backgroundImage: `url(${JSON.stringify(category.imageUrl)})`,
                    }}
                  />
                ) : (
                  <div
                    className={`absolute inset-0 ${
                      index % 3 === 0
                        ? 'bg-[#d9ff68]'
                        : index % 3 === 1
                          ? 'bg-[#d9e3dd]'
                          : 'bg-[#eadccd]'
                    }`}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                <div className="relative flex h-full items-end justify-between gap-3 text-white">
                  <h3 className="text-xl font-semibold sm:text-2xl">
                    {category.name}
                  </h3>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white/90 text-stone-950 transition group-hover:rotate-45">
                    <ArrowRight className="size-4 -rotate-45" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-[2rem] border border-dashed border-stone-900/15 bg-white/40 px-6 py-14 text-center">
            <p className="text-lg font-semibold">分类正在整理中</p>
            <p className="mt-2 text-sm text-stone-500">新作品很快与您见面。</p>
          </div>
        )}
      </section>

      <section className="bg-white/55">
        <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading
            eyebrow="为你精选"
            title="本期推荐"
            href="/products"
          />
          {data.featuredProducts.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
              {data.featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="rounded-[2rem] bg-[#17251c] px-7 py-14 text-white sm:px-12">
              <p className="text-xs font-bold tracking-[0.2em] text-[#d9ff68]">
                即将上新
              </p>
              <h3 className="mt-4 text-2xl font-semibold">
                精选作品正在准备中
              </h3>
              <p className="mt-3 max-w-lg text-sm leading-7 text-white/55">
                我们正在完成第一批作品的打样与参数校准，敬请期待。
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
        <SectionHeading
          eyebrow="最新上架"
          title="最新上架"
          href="/products?sort=newest"
        />
        {data.newestProducts.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {data.newestProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="aspect-[16/8] rounded-[2rem] bg-[#e9e5da]"
              />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="overflow-hidden rounded-[2rem] bg-[#d9ff68] px-7 py-12 sm:px-12 sm:py-16">
          <p className="text-xs font-bold tracking-[0.22em] text-[#52632b]">
            按单生产
          </p>
          <div className="mt-5 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
            <h2 className="max-w-3xl text-3xl leading-tight font-semibold tracking-[-0.04em] text-[#17251c] sm:text-5xl">
              不囤积过量成品，让每一次打印都有明确去处。
            </h2>
            <Link
              href="/products"
              className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#17251c] px-6 text-sm font-bold text-white"
            >
              开始探索 <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
