import { SiteFooter } from '@/components/shop/site-footer';
import { SiteHeader } from '@/components/shop/site-header';
import { getStorefrontSiteInfo } from '@/lib/services/storefront.service';

// Site settings come from PostgreSQL and must be resolved when the container is
// running, not while the immutable image is being built.
export const dynamic = 'force-dynamic';

export default async function ShopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const siteInfo = await getStorefrontSiteInfo();

  return (
    <div className="bg-store-canvas min-h-screen text-stone-950">
      <SiteHeader siteName={siteInfo.name} />
      {children}
      <SiteFooter siteInfo={siteInfo} />
    </div>
  );
}
