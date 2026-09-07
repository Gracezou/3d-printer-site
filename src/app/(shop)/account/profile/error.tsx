'use client';

import { useEffect } from 'react';

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('个人资料页面渲染失败', error);
  }, [error]);

  return (
    <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-14 sm:px-8">
      <div className="max-w-xl rounded-3xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-semibold text-red-900">
          个人资料暂时无法显示
        </h1>
        <p className="mt-2 text-sm leading-6 text-red-700">
          请重试；如果问题持续出现，请保留浏览器控制台中的完整错误信息。
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 h-10 rounded-full bg-red-900 px-5 text-sm font-semibold text-white"
        >
          重新加载
        </button>
      </div>
    </main>
  );
}
