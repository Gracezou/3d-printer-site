export interface SelectableVariant {
  id: string;
  selection: Record<string, string>;
}

export function optionHasStock(
  variants: SelectableVariant[],
  availability: ReadonlyMap<string, number>,
  dimension: string,
  value: string,
): boolean {
  return variants.some(
    (variant) =>
      variant.selection[dimension] === value &&
      (availability.get(variant.id) ?? 0) > 0,
  );
}

export function selectCompatibleAttributes(
  variants: SelectableVariant[],
  availability: ReadonlyMap<string, number>,
  current: Record<string, string>,
  dimension: string,
  value: string,
): Record<string, string> {
  if (current[dimension] === value) {
    const next = { ...current };
    delete next[dimension];
    return next;
  }

  let candidates = variants.filter(
    (variant) =>
      variant.selection[dimension] === value &&
      (availability.get(variant.id) ?? 0) > 0,
  );
  if (!candidates.length) return current;
  const next: Record<string, string> = { [dimension]: value };
  for (const [key, selected] of Object.entries(current)) {
    if (key === dimension) continue;
    const compatible = candidates.filter(
      (variant) => variant.selection[key] === selected,
    );
    if (compatible.length) {
      next[key] = selected;
      candidates = compatible;
    }
  }
  return next;
}
