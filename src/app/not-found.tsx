import { ArrowLeft, Search } from 'lucide-react';
import Link from 'next/link';

import { StorefrontEmptyState } from '@/components/shop/storefront-states';

export default function NotFound() {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-4xl place-items-center px-5 py-16 sm:px-8">
      <StorefrontEmptyState
        className="w-full"
        title="没有找到这个页面"
        description="链接可能已经失效，或这个机型暂未收录。可以回到首页按品牌、型号或别名重新搜索。"
        action={
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/#choose-device"
              className="bg-store-ink inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-bold text-white"
            >
              <Search className="size-4" /> 搜索设备机型
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
