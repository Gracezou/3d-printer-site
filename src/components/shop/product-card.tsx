import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { StorefrontProduct } from '@/lib/services/storefront.service';

interface ProductCardProps {
  product: StorefrontProduct;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="group min-w-0">
      <Link
        href={`/products/${product.slug}`}
        className="bg-store-image relative block aspect-[4/5] overflow-hidden rounded-[1.75rem]"
      >
        {product.mainImageUrl ? (
          <Image
            src={product.mainImageUrl}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover object-center transition duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="store-product-placeholder absolute inset-0 grid place-items-center">
            <span className="text-5xl font-black tracking-[-0.08em] text-stone-900/10">
              3D
            </span>
          </div>
        )}
        {product.isSoldOut ? (
          <span className="absolute top-4 left-4 rounded-full bg-stone-950 px-3 py-1.5 text-[11px] font-semibold text-white">
            暂时售罄
          </span>
        ) : null}
        <span className="absolute right-4 bottom-4 grid size-11 translate-y-2 place-items-center rounded-full bg-white text-stone-950 opacity-0 shadow-lg transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
          <ArrowUpRight className="size-4" />
        </span>
      </Link>
      <div className="mt-4 flex items-start justify-between gap-4 px-1">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-stone-900">
            <Link href={`/products/${product.slug}`}>{product.name}</Link>
          </h3>
          {product.subtitle ? (
            <p className="mt-1 truncate text-sm text-stone-500">
              {product.subtitle}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-semibold text-stone-900">
          {product.minPrice ? `¥${product.minPrice} 起` : '价格待定'}
        </p>
      </div>
    </article>
  );
}
