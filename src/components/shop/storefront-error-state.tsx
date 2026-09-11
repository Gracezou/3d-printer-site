'use client';

import { RefreshCcw, TriangleAlert } from 'lucide-react';

interface StorefrontErrorStateProps {
  title?: string;
  description?: string;
  retry: () => void;
}

export function StorefrontErrorState({
  title = '页面暂时没有加载出来',
  description = '可能是网络短暂波动，请稍后重试。',
  retry,
}: StorefrontErrorStateProps) {
  return (
    <main className="mx-auto grid min-h-[65vh] max-w-3xl place-items-center px-5 py-16 sm:px-8">
      <div className="rounded-store-xl shadow-store-card w-full border border-red-900/10 bg-white/70 px-6 py-14 text-center sm:px-10">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-red-50 text-red-600">
          <TriangleAlert className="size-6" />
        </span>
        <h1 className="mt-5 text-2xl font-semibold">{title}</h1>
        <p className="mt-3 text-sm leading-7 text-stone-500">{description}</p>
        <button
          type="button"
          onClick={retry}
          className="bg-store-ink hover:bg-store-ink-hover mt-7 inline-flex h-11 items-center gap-2 rounded-full px-6 text-sm font-bold text-white transition"
        >
          <RefreshCcw className="size-4" /> 重新加载
        </button>
      </div>
    </main>
  );
}
