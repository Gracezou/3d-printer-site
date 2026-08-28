export interface AttributeDimension {
  name: string;
  values: string[];
}

export function buildAttributeCombinations(
  dimensions: AttributeDimension[],
): Array<Record<string, string>> {
  const normalized = dimensions
    .map((dimension) => ({
      name: dimension.name.trim(),
      values: [
        ...new Set(dimension.values.map((value) => value.trim())),
      ].filter(Boolean),
    }))
    .filter((dimension) => dimension.name && dimension.values.length > 0);

  if (normalized.length === 0) return [];
  return normalized.reduce<Array<Record<string, string>>>(
    (combinations, dimension) =>
      combinations.flatMap((combination) =>
        dimension.values.map((value) => ({
          ...combination,
          [dimension.name]: value,
        })),
      ),
    [{}],
  );
}

export function buildVariantName(attributes: Record<string, string>): string {
  return Object.values(attributes).join(' / ');
}
