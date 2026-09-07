const productSpecLabels: Record<string, string> = {
  process: '打印工艺',
  usage: '用途',
  material: '材质',
  size: '尺寸',
  dimensions: '尺寸',
  weight: '重量',
  color: '颜色',
  style: '款式',
  layerHeight: '层高',
  infill: '填充率',
};

export const productDimensionLabels: Record<string, string> = {
  variant: '规格',
  size: '尺寸',
  material: '材质',
  color: '颜色',
  style: '款式',
};

export function getProductSpecLabel(key: string): string {
  return productSpecLabels[key] ?? key;
}
