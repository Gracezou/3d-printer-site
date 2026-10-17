'use client';

import { Expand, X } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

interface ProductGalleryProps {
  productName: string;
  images: string[];
  selectedImage?: string | null;
  selectionKey?: string | null;
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
      className={`object-contain object-center ${className}`}
    />
  );
}

export function ProductGallery({
  productName,
  images,
  selectedImage,
  selectionKey,
}: ProductGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [manualImage, setManualImage] = useState<{
    selection: string | null | undefined;
    image: string;
  } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const allImages = [
    ...new Set([...images, ...(selectedImage ? [selectedImage] : [])]),
  ];
  const activeImage =
    manualImage && manualImage.selection === selectionKey
      ? manualImage.image
      : (selectedImage ?? images[0]);
  const displayedIndex = activeImage
    ? allImages.indexOf(activeImage)
    : activeIndex;
  useEffect(() => {
    if (zoomed) dialog.current?.showModal();
    else dialog.current?.close();
  }, [zoomed]);

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
          alt={`${productName} 图片 ${displayedIndex + 1}`}
          priority
          className="absolute inset-0 transition duration-500 group-hover:scale-[1.02]"
        />
        <span className="absolute right-5 bottom-5 grid size-11 place-items-center rounded-full bg-white/90 shadow-lg backdrop-blur">
          <Expand className="size-4" />
        </span>
      </button>

      {allImages.length > 1 ? (
        <div className="mt-4 grid grid-cols-5 gap-3">
          {allImages.map((image, index) => (
            <button
              key={`${image}-${index}`}
              type="button"
              aria-label={`查看第 ${index + 1} 张商品图片`}
              aria-current={image === activeImage}
              onClick={() => {
                setActiveIndex(index);
                setManualImage({ selection: selectionKey, image });
              }}
              className={`bg-store-image relative aspect-square overflow-hidden rounded-xl border-2 ${image === activeImage ? 'border-store-ink' : 'border-transparent'}`}
            >
              <ProductImage src={image} alt="" className="absolute inset-0" />
            </button>
          ))}
        </div>
      ) : null}

      <dialog
        ref={dialog}
        onClose={() => setZoomed(false)}
        aria-label="商品图片大图"
        className="fixed inset-0 m-auto max-h-[95vh] max-w-[95vw] border-0 bg-white p-5 backdrop:bg-black/85"
      >
        <button
          type="button"
          aria-label="关闭大图"
          onClick={() => setZoomed(false)}
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-lg border border-stone-200 bg-white text-stone-950"
        >
          <X className="size-5" />
        </button>
        <div className="relative h-[80vh] w-[85vw]">
          <ProductImage
            src={activeImage}
            alt={`${productName} 大图`}
            className="object-contain"
          />
        </div>
      </dialog>
    </div>
  );
}
