'use client';

import { useCallback, useEffect } from 'react';

export function useUnsavedChanges(dirty: boolean) {
  const confirmDiscard = useCallback(
    () => !dirty || window.confirm('有尚未保存的修改，确定放弃并离开吗？'),
    [dirty],
  );
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      const anchor =
        event.target instanceof Element
          ? event.target.closest('a[href]')
          : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === '_blank' ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        anchor.href === window.location.href
      )
        return;
      if (!confirmDiscard()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', navigate, true);
    };
  }, [confirmDiscard, dirty]);
  return confirmDiscard;
}
