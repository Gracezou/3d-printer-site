'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useUnsavedChanges } from '@/lib/use-unsaved-changes';

export function AdminDrawer({
  title,
  description,
  onClose,
  children,
  busy = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [dirty, setDirty] = useState(false);
  const confirmDiscard = useUnsavedChanges(dirty);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  function close() {
    if (!busy && confirmDiscard()) onClose();
  }
  return (
    <dialog
      ref={dialog}
      className="admin-drawer"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        className="flex min-h-full flex-col"
        onChangeCapture={() => setDirty(true)}
        onClickCapture={(event) => {
          if (
            event.target instanceof Element &&
            event.target.closest('[data-drawer-close]')
          ) {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description ? (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="关闭编辑"
            disabled={busy}
            onClick={close}
            className="rounded-md p-2 hover:bg-neutral-100 disabled:opacity-40"
          >
            <X className="size-5" />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
