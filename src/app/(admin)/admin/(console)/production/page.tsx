import { ProductionBoard } from '@/components/admin/production-board';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function AdminProductionPage() {
  const admin = await requirePermission('production:view');
  return (
    <ProductionBoard
      canUpdate={hasPermission(admin.permissions, 'production:update')}
    />
  );
}
