import { OrdersManager } from '@/components/admin/orders-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function AdminOrdersPage() {
  const admin = await requirePermission('order:view');
  return (
    <OrdersManager
      canExport={hasPermission(admin.permissions, 'order:export')}
    />
  );
}
