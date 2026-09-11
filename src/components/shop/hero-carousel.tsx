'use client';

import { ArrowLeft, ArrowRight, MoveUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { StorefrontBanner } from '@/lib/services/storefront.service';

interface HeroCarouselProps {
  banners: StorefrontBanner[];
}

export function HeroCarousel({ banners }: HeroCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (banners.length < 2) return;
    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % banners.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [banners.length]);

  const activeBanner = banners[activeIndex] ?? banners[0];
  if (!activeBanner) return null;

  function move(offset: number): void {
    setActiveIndex(
      (index) => (index + offset + banners.length) % banners.length,
    );
  }

  return (
    <section
      aria-roledescription="轮播图"
      aria-label="首页推荐"
      className="bg-store-ink relative isolate min-h-[540px] overflow-hidden text-white sm:min-h-[620px]"
    >
      {activeBanner.imageUrl ? (
        <Image
          key={activeBanner.imageUrl}
          src={activeBanner.imageUrl}
          alt=""
          fill
          priority={activeIndex === 0}
          sizes="100vw"
          className="-z-20 object-cover object-center"
        />
      ) : (
        <div className="store-hero-gradient absolute inset-0 -z-20" />
      )}
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-black/55 via-black/15 to-transparent" />
      <div className="border-store-accent/15 absolute top-16 right-[8%] -z-10 size-64 rounded-full border sm:size-96" />
      <div className="border-store-accent/20 absolute top-36 right-[14%] -z-10 size-36 rounded-full border sm:size-52" />

      <div className="mx-auto flex min-h-[540px] max-w-7xl items-end px-5 py-16 sm:min-h-[620px] sm:items-center sm:px-8 sm:py-24">
        <div className="max-w-3xl" aria-live="polite">
          <p className="text-store-accent mb-5 flex items-center gap-3 text-xs font-bold tracking-[0.25em]">
            <span className="h-px w-8 bg-current" /> 按单生产 · 精细打印
          </p>
          <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.04em] text-balance sm:text-6xl lg:text-7xl">
            {activeBanner.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-white/68 sm:text-lg">
            {activeBanner.subtitle}
          </p>
          <Link
            href={activeBanner.linkUrl}
            className="bg-store-accent text-store-ink mt-9 inline-flex h-12 items-center gap-3 rounded-full px-6 text-sm font-bold transition hover:scale-[1.02] hover:bg-white"
          >
            {activeBanner.buttonText}
            <MoveUpRight className="size-4" />
          </Link>
        </div>
      </div>

      {banners.length > 1 ? (
        <div className="absolute right-5 bottom-7 flex items-center gap-2 sm:right-8 sm:bottom-10">
          <button
            type="button"
            aria-label="上一张 Banner"
            onClick={() => move(-1)}
            className="hover:text-store-ink grid size-11 place-items-center rounded-full border border-white/25 bg-black/10 backdrop-blur transition hover:bg-white"
          >
            <ArrowLeft className="size-4" />
          </button>
          <span className="px-2 text-xs text-white/60 tabular-nums">
            {String(activeIndex + 1).padStart(2, '0')} /{' '}
            {String(banners.length).padStart(2, '0')}
          </span>
          <button
            type="button"
            aria-label="下一张 Banner"
            onClick={() => move(1)}
            className="hover:text-store-ink grid size-11 place-items-center rounded-full border border-white/25 bg-black/10 backdrop-blur transition hover:bg-white"
          >
            <ArrowRight className="size-4" />
          </button>
        </div>
      ) : null}
    </section>
  );
}
