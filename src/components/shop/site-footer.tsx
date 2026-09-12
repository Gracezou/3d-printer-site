import Link from 'next/link';

import type { StorefrontSiteInfo } from '@/lib/services/storefront.service';

interface SiteFooterProps {
  siteInfo: StorefrontSiteInfo;
}

export function SiteFooter({ siteInfo }: SiteFooterProps) {
  const icpLicense = process.env.NEXT_PUBLIC_ICP_LICENSE?.trim();

  return (
    <footer className="bg-store-ink text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-5 py-14 sm:px-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <p className="text-store-accent text-xs font-bold tracking-[0.24em]">
            BOOKSKIN
          </p>
          <h2 className="mt-4 text-2xl font-semibold">书衣</h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/60">
            书衣 · 电子阅读器保护壳。按单打印，冷门机型与停产老款也做。
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">探索</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-white/55">
            <Link href="/products" className="transition hover:text-white">
              全部机型
            </Link>
            <Link
              href="/products?sort=newest"
              className="transition hover:text-white"
            >
              新开模
            </Link>
            <Link href="/auth/login" className="transition hover:text-white">
              我的账户
            </Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">联系我们</h2>
          <p className="mt-4 text-sm leading-7 text-white/55">
            {siteInfo.contact}
          </p>
          <p className="mt-2 text-xs leading-6 text-white/35">
            下单后排产打印、去支撑打磨并装机复核，7 个自然日内发出。
          </p>
        </div>
      </div>
      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>© {new Date().getFullYear()} 书衣</p>
          {icpLicense ? (
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-white/70"
            >
              {icpLicense}
            </a>
          ) : (
            <p>备案号待配置</p>
          )}
        </div>
      </div>
    </footer>
  );
}
