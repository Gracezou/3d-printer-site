import Link from 'next/link';

import type { StorefrontSiteInfo } from '@/lib/services/storefront.service';
import { zhCN } from '@/messages/zh-CN';

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
            {zhCN.brand.englishName.toUpperCase()}
          </p>
          <h2 className="mt-4 text-2xl font-semibold">{zhCN.brand.name}</h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-white/60">
            {zhCN.brand.footerDescription}
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{zhCN.navigation.explore}</h2>
          <div className="mt-4 flex flex-col gap-3 text-sm text-white/55">
            <Link href="/products" className="transition hover:text-white">
              {zhCN.navigation.allDevices}
            </Link>
            <Link
              href="/products?sort=newest"
              className="transition hover:text-white"
            >
              {zhCN.navigation.newest}
            </Link>
            <Link href="/auth/login" className="transition hover:text-white">
              {zhCN.navigation.account}
            </Link>
          </div>
        </div>
        <div>
          <h2 className="text-sm font-semibold">{zhCN.navigation.contact}</h2>
          <p className="mt-4 text-sm leading-7 text-white/55">
            {siteInfo.contact}
          </p>
          <p className="mt-2 text-xs leading-6 text-white/60">
            {zhCN.commerce.deliveryFooter}
          </p>
        </div>
      </div>
      <div className="border-t border-white/8">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-5 text-xs text-white/60 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>
            © {new Date().getFullYear()} {zhCN.brand.name}
          </p>
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
