import { MaterialsManager } from '@/components/admin/materials-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function MaterialsPage() {
  const admin = await requirePermission('material:view');

  return (
    <MaterialsManager
      permissions={{
        edit: hasPermission(admin.permissions, 'material:edit'),
        stockIn: hasPermission(admin.permissions, 'material:stock_in'),
        adjust: hasPermission(admin.permissions, 'material:adjust'),
      }}
    />
  );
}
