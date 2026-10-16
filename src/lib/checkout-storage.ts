export const CHECKOUT_STORAGE_KEY = 'checkout-selection';
import type { ProductDevice } from '@/lib/product-devices';

export interface CheckoutSelection {
  items: Array<{ variantId: string; quantity: number }>;
  fromCart: boolean;
  displayItems?: Array<{
    deviceModels?: ProductDevice[];
    variantId: string;
    productName: string;
    productSlug: string;
    variantName: string;
    imageUrl: string | null;
    unitPrice: string;
    quantity: number;
  }>;
}
