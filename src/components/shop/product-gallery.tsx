'use client';

import { Expand, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';

interface ProductGalleryProps {
  productName: string;
  images: string[];
}

function ProductImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string;
  alt: string;
  className: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      fill
      priority={priority}
      sizes="(min-width: 1024px) 50vw, 100vw"
      className={`object-cover object-center ${className}`}
    />
  );
}

export function ProductGallery({ productName, images }: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const activeImage = images[activeIndex];

  if (!activeImage) {
    return (
      <div className="store-product-placeholder grid aspect-square place-items-center rounded-[2rem]">
        <span className="text-7xl font-black tracking-[-0.08em] text-stone-900/10">
          3D
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-label="放大查看商品图片"
        onClick={() => setZoomed(true)}
        className="group bg-store-image relative block aspect-square w-full overflow-hidden rounded-[2rem]"
      >
        <ProductImage
          src={activeImage}
          alt={`${productName} 图片 ${activeIndex + 1}`}
          priority
          className="absolute inset-0 transition duration-500 group-hover:scale-[1.02]"
        />
        <span className="absolute right-5 bottom-5 grid size-11 place-items-center rounded-full bg-white/90 shadow-lg backdrop-blur">
          <Expand className="size-4" />
        </span>
      </button>

      {images.length > 1 ? (
        <div className="mt-4 grid grid-cols-5 gap-3">
          {images.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              aria-label={`查看第 ${index + 1} 张商品图片`}
              aria-current={index === activeIndex}
              onClick={() => setActiveIndex(index)}
              className={`bg-store-image relative aspect-square overflow-hidden rounded-xl border-2 ${index === activeIndex ? 'border-store-ink' : 'border-transparent'}`}
            >
              <ProductImage src={image} alt="" className="absolute inset-0" />
            </button>
          ))}
        </div>
      ) : null}

      {zoomed ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="商品图片大图"
          className="fixed inset-0 z-50 grid place-items-center bg-black/88 p-5"
        >
          <button
            type="button"
            aria-label="关闭大图"
            onClick={() => setZoomed(false)}
            className="absolute top-5 right-5 grid size-11 place-items-center rounded-full bg-white text-stone-950"
          >
            <X className="size-5" />
          </button>
          <ProductImage
            src={activeImage}
            alt={`${productName} 大图`}
            className="object-contain"
          />
        </div>
      ) : null}
    </div>
  );
}
