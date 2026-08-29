import { PromotionsManager } from '@/components/admin/promotions-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function AdminPromotionsPage() {
  const admin = await requirePermission('promotion:view');
  return (
    <PromotionsManager
      canEdit={hasPermission(admin.permissions, 'promotion:edit')}
    />
  );
}
