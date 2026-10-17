export function normalizeProductColors<
  T extends { id: string; name: string; attributes: Record<string, string> },
>(variants: T[]) {
  const normalized = variants.map((variant) => ({
    ...variant,
    selection: {
      style:
        variant.attributes.style ??
        variant.attributes['款式'] ??
        variant.attributes.size ??
        variant.attributes['尺寸'] ??
        '标准款',
      color:
        variant.attributes.color ??
        variant.attributes['配色'] ??
        variant.attributes['颜色'] ??
        variant.name,
    },
  }));
  // Keep legacy duplicate combinations reachable until the merchant reviews them.
  const counts = new Map<string, number>();
  for (const v of normalized) {
    const key = JSON.stringify(v.selection);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return normalized.map((v) =>
    (counts.get(JSON.stringify(v.selection)) ?? 0) > 1
      ? {
          ...v,
          selection: {
            ...v.selection,
            color: `${v.selection.color} · ${v.id}`,
          },
        }
      : v,
  );
}
