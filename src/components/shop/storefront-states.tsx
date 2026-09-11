import { PackageSearch } from 'lucide-react';
import type { ReactNode } from 'react';

interface StorefrontEmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function StorefrontEmptyState({
  title,
  description,
  action,
  icon,
  className = '',
}: StorefrontEmptyStateProps) {
  return (
    <div
      className={`rounded-store-xl flex min-h-72 flex-col items-center justify-center border border-dashed border-stone-900/15 bg-white/40 px-6 text-center ${className}`}
    >
      <span className="grid size-14 place-items-center rounded-full bg-stone-900/5 text-stone-400">
        {icon ?? <PackageSearch className="size-6" />}
      </span>
      <h2 className="mt-5 text-xl font-semibold">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-stone-500">
        {description}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

function SkeletonBlock({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`rounded-store-lg animate-pulse bg-stone-900/8 ${className}`}
    />
  );
}

export function HomePageSkeleton() {
  return (
    <main aria-busy="true" aria-label="首页正在加载">
      <span className="sr-only">首页正在加载，请稍候。</span>
      <SkeletonBlock className="bg-store-ink/90 min-h-[540px] rounded-none sm:min-h-[620px]" />
      <div className="mx-auto max-w-7xl space-y-16 px-5 py-20 sm:px-8">
        <div className="grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <SkeletonBlock key={item} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <SkeletonBlock key={item} className="aspect-[4/5]" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function ProductListSkeleton() {
  return (
    <main aria-busy="true" aria-label="商品列表正在加载">
      <span className="sr-only">商品列表正在加载，请稍候。</span>
      <SkeletonBlock className="bg-store-mist h-56 rounded-none" />
      <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <SkeletonBlock className="h-36" />
        <div className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((item) => (
            <SkeletonBlock key={item} className="aspect-[4/5]" />
          ))}
        </div>
      </div>
    </main>
  );
}

export function ProductDetailSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="商品详情正在加载"
      className="mx-auto max-w-7xl px-5 py-8 sm:px-8"
    >
      <span className="sr-only">商品详情正在加载，请稍候。</span>
      <SkeletonBlock className="h-5 w-52 rounded-full" />
      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-16">
        <SkeletonBlock className="aspect-square" />
        <div className="space-y-6 pt-6">
          <SkeletonBlock className="h-4 w-24 rounded-full" />
          <SkeletonBlock className="h-14 w-4/5" />
          <SkeletonBlock className="h-6 w-3/5" />
          <SkeletonBlock className="h-40 w-full" />
          <SkeletonBlock className="h-12 w-full rounded-full" />
        </div>
      </div>
    </main>
  );
}
