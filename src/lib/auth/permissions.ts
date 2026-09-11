import { BizError } from '@/lib/errors';

export const PERMISSIONS = [
  'dashboard:view',
  'order:view',
  'order:ship',
  'order:cancel',
  'order:refund',
  'order:remark',
  'order:export',
  'production:view',
  'production:update',
  'product:view',
  'product:edit',
  'product:publish',
  'category:view',
  'category:edit',
  'device:manage',
  'material:view',
  'material:edit',
  'material:stock_in',
  'material:adjust',
  'user:view',
  'user:disable',
  'promotion:view',
  'promotion:edit',
  'admin:view',
  'admin:edit',
  'role:edit',
  'settings:edit',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function hasPermission(
  permissions: readonly string[],
  required: Permission,
): boolean {
  return permissions.includes('*') || permissions.includes(required);
}

export function assertPermission(
  permissions: readonly string[],
  required: Permission,
): void {
  if (!hasPermission(permissions, required)) {
    throw new BizError('FORBIDDEN', '无该操作权限');
  }
}
