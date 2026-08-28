import { SiteFooter } from '@/components/shop/site-footer';
import { SiteHeader } from '@/components/shop/site-header';
import { getHomePageData } from '@/lib/services/storefront.service';

export default async function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { siteInfo } = await getHomePageData();

  return (
    <div className="min-h-screen bg-[#f7f5ef] text-stone-950">
      <SiteHeader siteName={siteInfo.name} />
      {children}
      <SiteFooter siteInfo={siteInfo} />
    </div>
  );
}
