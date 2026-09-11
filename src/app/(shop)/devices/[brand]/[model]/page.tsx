import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  PackageSearch,
  Ruler,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ModelRequestForm } from '@/components/shop/model-request-form';
import { ProductCard } from '@/components/shop/product-card';
import { StorefrontEmptyState } from '@/components/shop/storefront-states';
import { BizError } from '@/lib/errors';
import { getPublicDeviceDetail } from '@/lib/services/device.service';

export const dynamic = 'force-dynamic';

interface DevicePageProps {
  params: Promise<{ brand: string; model: string }>;
}

async function findDevice(brand: string, model: string) {
  try {
    return await getPublicDeviceDetail(brand, model);
  } catch (error: unknown) {
    if (error instanceof BizError && error.code === 40401) return undefined;
    throw error;
  }
}

export async function generateMetadata({
  params,
}: DevicePageProps): Promise<Metadata> {
  const { brand, model } = await params;
  const device = await findDevice(brand, model);
  if (!device) return { title: '机型不存在' };
  const title = `${device.brandName}${device.name} 保护壳｜书衣`;
  const description = `查找适用于 ${device.brandName} ${device.name} 的电子阅读器保护壳；没有现成款式时，可登记开模意向。`;
  return {
    title,
    description,
    alternates: { canonical: `/devices/${device.brandSlug}/${device.slug}` },
    openGraph: { title, description },
  };
}

function dimensionText(
  device: Awaited<ReturnType<typeof getPublicDeviceDetail>>,
) {
  const { widthMm, heightMm, thicknessMm, weightGrams } = device.dimensions;
  const size = [heightMm, widthMm, thicknessMm]
    .filter((value): value is number => typeof value === 'number')
    .join(' × ');
  return {
    size: size ? `${size} mm` : '待实机复核',
    weight: weightGrams ? `${weightGrams} g` : '未录入',
  };
}

export default async function DevicePage({ params }: DevicePageProps) {
  const { brand, model } = await params;
  const device = await findDevice(brand, model);
  if (!device) notFound();
  const dimensions = dimensionText(device);

  return (
    <main>
      <section className="bg-store-mist border-b border-stone-900/8">
        <div className="mx-auto max-w-7xl px-5 py-6 sm:px-8">
          <nav
            aria-label="面包屑"
            className="flex flex-wrap items-center gap-2 text-xs text-stone-400"
          >
            <Link href="/" className="hover:text-stone-800">
              首页
            </Link>
            <ChevronRight className="size-3" />
            <span>设备</span>
            <ChevronRight className="size-3" />
            <span>{device.brandName}</span>
            <ChevronRight className="size-3" />
            <span className="text-stone-700">{device.name}</span>
          </nav>

          <div className="grid gap-10 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:items-end lg:py-20">
            <div>
              <p className="text-store-muted text-xs font-bold tracking-[0.22em]">
                {device.brandName} · 电子阅读器
              </p>
              <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-[-0.05em] sm:text-6xl">
                适用于 {device.brandName} {device.name}
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-8 text-stone-600">
                为这台设备寻找贴合的 3D
                打印保护壳。我们会在正式开模前用实机复核外形、接口、按键和必要的磁吸位置。
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs">
                {device.releaseYear ? (
                  <span className="rounded-full border border-stone-900/10 bg-white/70 px-3 py-1.5">
                    {device.releaseYear} 年发布
                  </span>
                ) : null}
                {device.isDiscontinued ? (
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-800">
                    已停产机型
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-3 py-1.5 ${device.isMolded ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-900/7 text-stone-600'}`}
                >
                  {device.isMolded ? '已开模' : '等待开模'}
                </span>
              </div>
            </div>

            <dl className="rounded-store-xl border border-stone-900/8 bg-white/70 p-6 shadow-sm">
              <div className="flex items-start gap-4 border-b border-stone-900/8 pb-5">
                <Ruler className="text-store-muted mt-0.5 size-5" />
                <div>
                  <dt className="text-xs text-stone-400">
                    设备尺寸（高 × 宽 × 厚）
                  </dt>
                  <dd className="mt-1 font-semibold">{dimensions.size}</dd>
                </div>
              </div>
              <div className="flex items-start gap-4 border-b border-stone-900/8 py-5">
                <PackageSearch className="text-store-muted mt-0.5 size-5" />
                <div>
                  <dt className="text-xs text-stone-400">设备重量</dt>
                  <dd className="mt-1 font-semibold">{dimensions.weight}</dd>
                </div>
              </div>
              <div className="flex items-start gap-4 pt-5">
                <CalendarDays className="text-store-muted mt-0.5 size-5" />
                <div>
                  <dt className="text-xs text-stone-400">交付说明</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    下单后 7 个自然日内发出
                  </dd>
                </div>
              </div>
            </dl>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="text-store-muted text-xs font-bold tracking-[0.22em]">
          适配信息
        </p>
        <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          开模前，我们会再量一次
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            '复核机身尺寸与圆角',
            '核对按键、接口与扬声器开口',
            '装机测试后再安排发货',
          ].map((item) => (
            <div
              key={item}
              className="rounded-store-lg border border-stone-900/8 bg-white/55 p-5"
            >
              <CheckCircle2 className="text-store-muted size-5" />
              <p className="mt-4 text-sm font-semibold">{item}</p>
            </div>
          ))}
        </div>
        {device.notes ? (
          <p className="mt-8 max-w-3xl rounded-2xl bg-stone-900/5 p-5 text-sm leading-7 text-stone-600">
            {device.notes}
          </p>
        ) : null}
      </section>

      <section className="border-y border-stone-900/8 bg-white/55">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <p className="text-store-muted text-xs font-bold tracking-[0.22em]">
            已开模款式
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            适用于这台设备的保护壳
          </h2>
          {device.products.length ? (
            <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
              {device.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <StorefrontEmptyState
              className="mt-10"
              title="这台设备暂时没有现成保护壳"
              description="冷门和停产机型也值得被好好保护。登记需求后，我们会根据人数和实机条件安排开模。"
            />
          )}
        </div>
      </section>

      {!device.products.length ? (
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-24">
          <ModelRequestForm
            deviceModelId={device.id}
            deviceName={`${device.brandName} ${device.name}`}
            initialRequestCount={device.requestCount}
          />
        </div>
      ) : null}

      {device.compatibleModels.length ? (
        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 sm:pb-24">
          <h2 className="text-2xl font-semibold tracking-[-0.03em]">
            可能共用壳体的机型
          </h2>
          <p className="mt-2 text-sm text-stone-500">
            以下机型属于同一兼容组，实际适配仍以装机复核结果为准。
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {device.compatibleModels.map((compatible) => (
              <Link
                key={`${compatible.brandSlug}/${compatible.slug}`}
                href={`/devices/${compatible.brandSlug}/${compatible.slug}`}
                className="rounded-full border border-stone-900/12 bg-white px-4 py-2 text-sm font-semibold hover:border-stone-900/30"
              >
                {compatible.brandName} {compatible.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <div className="mx-auto max-w-7xl px-5 pb-16 sm:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-stone-500 hover:text-stone-900"
        >
          <ArrowLeft className="size-4" /> 返回首页继续选择设备
        </Link>
      </div>
    </main>
  );
}
