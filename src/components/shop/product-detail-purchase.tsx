'use client';

import { useCallback, useState } from 'react';
import type { ComponentProps } from 'react';
import { ProductGallery } from './product-gallery';
import { ProductPurchasePanel } from './product-purchase-panel';

type Props = ComponentProps<typeof ProductPurchasePanel> & {
  images: string[];
  subtitle: string | null;
};

export function ProductDetailPurchase({
  images,
  subtitle,
  ...purchase
}: Props) {
  const [selectedImage, setSelectedImage] = useState<{
    url: string | null;
    key: string | null;
  }>({ url: null, key: null });
  const changeImage = useCallback(
    (url: string | null, key: string | null) => setSelectedImage({ url, key }),
    [],
  );
  return (
    <section className="mx-auto grid max-w-7xl gap-7 px-5 pb-10 sm:px-8 lg:grid-cols-2 lg:gap-10">
      <ProductGallery
        productName={purchase.productName}
        images={images}
        selectedImage={selectedImage.url}
        selectionKey={selectedImage.key}
      />
      <div className="lg:py-2">
        <p className="text-store-muted text-xs font-semibold">
          按单生产 · 7 天内发出
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          {purchase.productName}
        </h1>
        {subtitle ? (
          <p className="mt-3 text-sm leading-6 text-stone-600">{subtitle}</p>
        ) : null}
        <div className="mt-5 border-t border-stone-900/10 pt-5">
          <ProductPurchasePanel
            {...purchase}
            onSelectedImageChange={changeImage}
          />
        </div>
      </div>
    </section>
  );
}
