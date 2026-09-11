'use client';

import { useEffect } from 'react';

import { StorefrontErrorState } from '@/components/shop/storefront-error-state';

export default function DeviceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Device route failed', error);
  }, [error]);

  return <StorefrontErrorState retry={reset} />;
}
