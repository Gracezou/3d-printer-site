'use client';

import { useEffect } from 'react';

import { StorefrontErrorState } from '@/components/shop/storefront-error-state';

export default function ShopError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Storefront route failed', error);
  }, [error]);

  return <StorefrontErrorState retry={reset} />;
}
