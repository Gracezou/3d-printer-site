import { deviceLabel, type ProductDevice } from '@/lib/product-devices';

export function DeviceFit({
  devices,
  current = false,
}: {
  devices?: ProductDevice[];
  current?: boolean;
}) {
  if (!devices?.length) return null;
  return (
    <p className="mt-2 text-xs leading-5 text-stone-600">
      {current ? '商品当前适配' : '适配机型'}：
      {devices.map(deviceLabel).join('、')}
    </p>
  );
}
