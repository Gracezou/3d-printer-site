export interface ProductDevice {
  id: string;
  name: string;
  brandName: string;
  slug: string;
  brandSlug: string;
}

export function deviceLabel(device: ProductDevice) {
  return `${device.brandName} ${device.name}`;
}
