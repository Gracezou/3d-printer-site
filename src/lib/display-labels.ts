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
  process: '打印工艺',
  variant: '规格',
  size: '尺寸',
  material: '材质',
  color: '颜色',
  style: '款式',
};

export const productDimensionHints: Record<string, string> = {
  material: '材质影响手感与使用限制，请按商品说明选择，并单独核对适配机型。',
  process: '打印工艺决定成型方式，逐层打印可能保留细微层纹。',
  color: '颜色以文字名称和所选规格为准，屏幕显示可能存在色差。',
};

export function getProductSpecLabel(key: string): string {
  return productSpecLabels[key] ?? key;
}
