import {
  ArrowDown,
  ArrowRight,
  Box,
  Hammer,
  PackageCheck,
  Printer,
  Ruler,
  Search,
  Sparkles,
} from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

import { DeviceSelector } from '@/components/shop/device-selector';
import { ProductCard } from '@/components/shop/product-card';
import { getHomePageData } from '@/lib/services/storefront.service';

export const dynamic = 'force-dynamic';

const HOME_DESCRIPTION =
  '专做墨水屏阅读器保护壳，覆盖阅星瞳、Kindle、掌阅、文石等品牌，含停产老机型。按单 3D 打印，装机复核后 7 天内发出。没有你的型号？登记意向，够人要就开模。';

export const metadata: Metadata = {
  title: {
    absolute: '书衣｜电子阅读器保护壳 · 按单打印，冷门机型也有',
  },
  description: HOME_DESCRIPTION,
  alternates: { canonical: '/' },
};

function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel = '查看全部',
}: {
  eyebrow: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex items-end justify-between gap-5 sm:mb-10">
      <div>
        <p className="text-store-muted text-xs font-bold tracking-[0.22em]">
          {eyebrow}
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          {title}
        </h2>
      </div>
      {href ? (
        <Link
          href={href}
          className="hidden items-center gap-2 border-b border-stone-900/20 pb-1 text-sm font-semibold transition hover:border-stone-900 sm:flex"
        >
          {linkLabel} <ArrowRight className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

const values = [
  {
    icon: Search,
    title: '冷门也有',
    description: '从主流机型到停产老款，大厂不愿意开模的，我们做。',
  },
  {
    icon: Printer,
    title: '按单打印',
    description: '不囤货。下单之后，才为你这一台机器开始打印。',
  },
  {
    icon: Sparkles,
    title: '没有就登记',
    description: '找不到你的型号？登记一下，够人要我们就开模。',
  },
] as const;

const deliverySteps = [
  { icon: Box, label: '下单' },
  { icon: Printer, label: '排产打印' },
  { icon: Hammer, label: '去支撑打磨' },
  { icon: Ruler, label: '装机复核' },
  { icon: PackageCheck, label: '打包发货' },
] as const;

export default async function HomePage() {
  const data = await getHomePageData();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:5003';
  const heroImage = data.banners[0]?.imageUrl;
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: '书衣',
      alternateName: 'Bookskin',
      url: siteUrl,
      description: '为每一台阅读器做一件合身的壳。',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: '书衣',
      alternateName: 'Bookskin',
      url: siteUrl,
      description: HOME_DESCRIPTION,
      inLanguage: 'zh-CN',
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

      <section className="bg-store-ink relative isolate min-h-[calc(100svh-72px)] overflow-hidden text-white">
        {heroImage ? (
          <Image
            src={heroImage}
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover object-center"
          />
        ) : (
          <div className="store-hero-gradient absolute inset-0 -z-20" />
        )}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/70 via-black/35 to-black/10" />
        <div className="border-store-accent/20 absolute top-16 right-[6%] -z-10 size-72 rounded-full border sm:size-[28rem]" />
        <div className="mx-auto flex min-h-[calc(100svh-72px)] max-w-7xl items-center px-5 py-14 sm:px-8 sm:py-20">
          <div className="w-full max-w-4xl">
            <p className="text-store-accent flex items-center gap-3 text-xs font-bold tracking-[0.25em]">
              <span className="h-px w-8 bg-current" /> 书衣 · 阅读器保护壳
            </p>
            <h1 className="mt-5 text-5xl leading-[1.03] font-semibold tracking-[-0.06em] text-balance sm:text-7xl lg:text-8xl">
              量卷裁衣
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/70 sm:text-lg">
              为每一台电子阅读器，做一件合身的壳。新品到停产旧机，按单打印，一台也做。
            </p>
            <div id="choose-device" className="mt-9 max-w-3xl scroll-mt-28">
              <DeviceSelector brands={data.deviceCatalog} />
            </div>
          </div>
        </div>
        <a
          href="#why-bookskin"
          aria-label="继续了解书衣"
          className="absolute bottom-5 left-1/2 grid size-10 -translate-x-1/2 place-items-center rounded-full border border-white/15 text-white/50"
        >
          <ArrowDown className="size-4" />
        </a>
      </section>

      <section
        id="why-bookskin"
        className="mx-auto max-w-7xl scroll-mt-24 px-5 py-16 sm:px-8 sm:py-24"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {values.map(({ icon: Icon, title, description }, index) => (
            <article
              key={title}
              className={`rounded-store-xl p-6 sm:p-7 ${
                index === 1 ? 'bg-store-accent' : 'bg-white/65'
              }`}
            >
              <Icon className="text-store-muted size-6" />
              <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">
                {title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-stone-600">
                {description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-stone-900/8 bg-white/55">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="已开模机型"
            title="现在就能买的"
            href="/products"
            linkLabel="浏览全部机型"
          />
          {data.featuredProducts.length ? (
            <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2">
              {data.featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="bg-store-mist rounded-store-xl px-7 py-12 sm:px-10">
              <p className="text-lg font-semibold">首批保护壳正在装机复核</p>
              <p className="mt-2 text-sm leading-7 text-stone-500">
                通过复核的款式会出现在这里。在此之前，可以先从上方选择你的设备。
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <SectionHeading
          eyebrow="新开模"
          title="刚做出来的"
          href="/products?sort=newest"
          linkLabel="查看更多"
        />
        {data.newestProducts.length ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
            {data.newestProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <p className="rounded-store-xl border border-dashed border-stone-900/15 px-6 py-12 text-center text-sm text-stone-500">
            新开模款式正在准备中。
          </p>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-24">
        <div className="bg-store-accent rounded-store-xl grid gap-8 overflow-hidden px-7 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.25fr_0.75fr] lg:items-end">
          <div>
            <p className="text-store-accent-ink text-xs font-bold tracking-[0.22em]">
              还没有你的型号？
            </p>
            <h2 className="text-store-ink mt-4 text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-5xl">
              登记一下，够人要就开
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-700">
              先在设备选择器里找到对应机型，进入机型页即可留下需求。下一个开哪个机型，由真实需求决定。
            </p>
          </div>
          <a
            href="#choose-device"
            className="bg-store-ink inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-sm font-bold text-white"
          >
            选择我的设备 <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <section className="bg-store-ink text-white">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <SectionHeading
            eyebrow="按单生产 · 7 天内发出"
            title="一件壳怎样来到你手里"
          />
          <ol className="grid gap-3 sm:grid-cols-5">
            {deliverySteps.map(({ icon: Icon, label }, index) => (
              <li
                key={label}
                className="rounded-store-lg border border-white/10 bg-white/5 p-5"
              >
                <div className="flex items-center justify-between">
                  <Icon className="text-store-accent size-5" />
                  <span className="text-xs text-white/30">0{index + 1}</span>
                </div>
                <p className="mt-8 text-sm font-semibold">{label}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 grid gap-4 text-sm leading-7 text-white/60 lg:grid-cols-2">
            <p>
              我们不囤货。你下单之后，这件壳才进入打印队列。打印完成后会手工去除支撑、打磨接缝，再装到对应机型上复核卡扣和开孔，确认没问题才寄出。
            </p>
            <p>
              自下单起，排产打印、去支撑打磨、装机复核与打包发货合计在 7
              个自然日内完成。订单集中时排产可能顺延，我们会在订单状态里同步进度。
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-[0.55fr_1.45fr]">
        <div>
          <p className="text-store-muted text-xs font-bold tracking-[0.22em]">
            书衣 · 电子阅读器保护壳
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            小众机型，也该有合身的壳
          </h2>
        </div>
        <div className="space-y-5 text-sm leading-8 text-stone-600 sm:text-base">
          <p>
            书衣是一家专做电子阅读器保护壳的按单打印店，覆盖阅星瞳、Kindle、掌阅、文石等主流品牌，也做已经停产、大厂不再供货的老机型。
          </p>
          <p>
            墨水屏阅读器的机型非常碎片化，每个型号尺寸都不一样，壳不通用。注塑开模的成本要靠销量摊平，所以厂商只愿意做最热门的那几款——冷门型号和停产老款的用户，往往全网都买不到一件合适的壳。
          </p>
          <p>
            我们用 3D
            打印按单生产，没有开模成本，一个型号只有几十个人需要也做得起。每件壳在下单后才开始打印，逐层成形，再经过手工打磨和装机复核，确认卡扣与开孔无误才发出，通常
            7 天内完成。
          </p>
          <p>
            如果站内还没有你的型号，可以登记意向。同一机型的登记人数够了，我们就安排建模和打样。下一个做哪台机器，由需求决定。
          </p>
        </div>
      </section>
    </main>
  );
}
