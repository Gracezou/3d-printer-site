import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

import { StorefrontEmptyState } from '@/components/shop/storefront-states';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-4xl place-items-center px-5 py-16 sm:px-8">
      <StorefrontEmptyState
        className="w-full"
        title="没有找到这个页面"
        description="链接可能已经失效，或者这件作品暂时没有上架。"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/products"
              className="bg-store-ink inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-bold text-white"
            >
              <Search className="size-4" /> 浏览全部机型
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center gap-2 rounded-full border border-stone-900/12 px-6 text-sm font-bold"
            >
              <ArrowLeft className="size-4" /> 返回首页
            </Link>
          </div>
        }
      />
    </main>
  );
}
