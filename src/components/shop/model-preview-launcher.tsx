'use client';

import { Box, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const ModelViewer = dynamic(
  () =>
    import('@/components/shop/model-viewer').then(
      (module) => module.ModelViewer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="grid h-full place-items-center text-sm text-white/55">
        正在加载 3D 查看器…
      </div>
    ),
  },
);

interface ModelPreviewLauncherProps {
  modelUrl: string;
  productName: string;
}

export function ModelPreviewLauncher({
  modelUrl,
  productName,
}: ModelPreviewLauncherProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-4 left-4 z-10 inline-flex h-11 items-center gap-2 rounded-full bg-[#17251c] px-4 text-xs font-bold text-white shadow-lg transition hover:bg-[#294131] sm:top-5 sm:left-5"
      >
        <Box className="size-4 text-[#d9ff68]" /> 3D 预览
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${productName} 3D 预览`}
          className="fixed inset-0 z-50 bg-[#111914]"
        >
          <div className="absolute top-0 right-0 left-0 z-10 flex h-16 items-center justify-between border-b border-white/10 bg-[#111914]/80 px-4 text-white backdrop-blur sm:px-6">
            <div>
              <p className="text-sm font-semibold">{productName}</p>
              <p className="mt-0.5 text-[11px] text-white/45">
                拖动旋转 · 滚轮或双指缩放
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭 3D 预览"
              onClick={() => setOpen(false)}
              className="grid size-10 place-items-center rounded-full border border-white/15 transition hover:bg-white hover:text-[#17251c]"
            >
              <X className="size-5" />
            </button>
          </div>
          <div className="h-full pt-16">
            <ModelViewer modelUrl={modelUrl} productName={productName} />
          </div>
        </div>
      ) : null}
    </>
  );
}
