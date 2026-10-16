import Image from 'next/image';
import Link from 'next/link';

import type { StorefrontProduct } from '@/lib/services/storefront.service';
import { deviceLabel } from '@/lib/product-devices';

interface ProductCardProps {
  product: StorefrontProduct;
  imageOnly?: boolean;
  deviceModelId?: string;
}

export function ProductCard({
  product,
  imageOnly = false,
  deviceModelId,
}: ProductCardProps) {
  const href = `/products/${product.slug}${deviceModelId ? `?device=${encodeURIComponent(deviceModelId)}` : ''}`;
  return (
    <article className="group min-w-0">
      <Link
        href={href}
        aria-label={`查看${product.name}${product.isSoldOut ? '（暂时售罄）' : ''}`}
        className="bg-store-image relative block aspect-square overflow-hidden rounded-lg"
      >
        {product.mainImageUrl ? (
          <Image
            src={product.mainImageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="object-contain object-center"
          />
        ) : (
          <div className="store-product-placeholder absolute inset-0 grid place-items-center">
            <span className="text-5xl font-black tracking-[-0.08em] text-stone-900/10">
              3D
            </span>
          </div>
        )}
        {product.isSoldOut && !imageOnly ? (
          <span className="absolute top-4 left-4 rounded-full bg-stone-950 px-3 py-1.5 text-[11px] font-semibold text-white">
            暂时售罄
          </span>
        ) : null}
      </Link>
      {!imageOnly ? (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-stone-900">
              <Link href={href}>{product.name}</Link>
            </h3>
            {product.subtitle ? (
              <p className="mt-1 truncate text-sm text-stone-500">
                {product.subtitle}
              </p>
            ) : null}
            {product.deviceModels?.length ? (
              <p className="mt-1 text-xs leading-5 text-stone-600">
                适配：{product.deviceModels.map(deviceLabel).join('、')}
              </p>
            ) : null}
          </div>
          <p className="shrink-0 text-sm font-semibold text-stone-900">
            {product.minPrice ? `¥${product.minPrice} 起` : '价格待定'}
          </p>
        </div>
      ) : null}
    </article>
  );
}
