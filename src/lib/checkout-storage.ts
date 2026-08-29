export const CHECKOUT_STORAGE_KEY = 'checkout-selection';

export interface CheckoutSelection {
  items: Array<{ variantId: string; quantity: number }>;
  fromCart: boolean;
  displayItems?: Array<{
    variantId: string;
    productName: string;
    productSlug: string;
    variantName: string;
    imageUrl: string | null;
    unitPrice: string;
    quantity: number;
  }>;
}
