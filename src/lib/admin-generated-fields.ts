function compactIdentifier(value: string, fallback: string): string {
  const compacted = value
    .normalize('NFKC')
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return compacted || fallback;
}

export interface MaterialGeneratedFieldsInput {
  materialType: string;
  colorName?: string | null;
  colorHex?: string | null;
  brand?: string | null;
}

export function generateMaterialFields(input: MaterialGeneratedFieldsInput): {
  code: string;
  name: string;
} {
  const colorCode =
    input.colorHex?.replace(/^#/u, '').toUpperCase() || 'NO-COLOR';
  const brandCode = compactIdentifier(input.brand ?? '', 'GENERIC');
  const typeCode = compactIdentifier(input.materialType, 'OTHER');
  const colorName = input.colorName?.trim() || '未命名色';
  const brandName = input.brand?.trim() || '通用';

  return {
    code: `${colorCode}-${brandCode}-${typeCode}`.slice(0, 64),
    name: `${colorName} ${brandName} ${input.materialType.trim() || 'OTHER'}`.slice(
      0,
      100,
    ),
  };
}

function asciiSlugPart(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function generateProductSlug(
  categorySlug: string | null | undefined,
  productName: string,
  uniqueSuffix: string,
): string {
  const category = asciiSlugPart(categorySlug ?? '') || 'product';
  const name = asciiSlugPart(productName) || 'item';
  const suffix = asciiSlugPart(uniqueSuffix) || 'new';
  const reservedLength = suffix.length + 1;
  const prefix = `${category}-${name}`.slice(0, 150 - reservedLength);
  return `${prefix.replace(/-+$/g, '')}-${suffix}`;
}

export function composeMaterialBatchNo(
  purchaseDate: string,
  orderNo: string,
): string | null {
  const datePart = purchaseDate.replaceAll('-', '').trim();
  const orderPart = orderNo.trim();
  if (!datePart && !orderPart) return null;
  return [datePart, orderPart].filter(Boolean).join('-').slice(0, 64);
}
