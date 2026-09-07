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

  const candidates = variants
    .filter(
      (variant) =>
        variant.selection[dimension] === value &&
        (availability.get(variant.id) ?? 0) > 0,
    )
    .sort((left, right) => {
      const score = (variant: SelectableVariant) =>
        Object.entries(current).filter(
          ([key, selected]) =>
            key !== dimension && variant.selection[key] === selected,
        ).length;
      return score(right) - score(left);
    });

  return candidates[0] ? { ...candidates[0].selection } : current;
}
