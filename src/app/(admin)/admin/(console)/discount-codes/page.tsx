import { DiscountCodesManager } from '@/components/admin/discount-codes-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function AdminDiscountCodesPage() {
  const admin = await requirePermission('promotion:view');
  return (
    <DiscountCodesManager
      canEdit={hasPermission(admin.permissions, 'promotion:edit')}
    />
  );
}
