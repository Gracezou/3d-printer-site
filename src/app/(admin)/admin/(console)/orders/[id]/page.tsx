import { OrderDetailManager } from '@/components/admin/order-detail-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';
import { adminOrderIdSchema } from '@/lib/validators/admin-order';

interface AdminOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminOrderDetailPage({
  params,
}: AdminOrderDetailPageProps) {
  const admin = await requirePermission('order:view');
  const orderId = adminOrderIdSchema.parse((await params).id);
  return (
    <OrderDetailManager
      orderId={orderId}
      permissions={{
        remark: hasPermission(admin.permissions, 'order:remark'),
        ship: hasPermission(admin.permissions, 'order:ship'),
        cancel: hasPermission(admin.permissions, 'order:cancel'),
      }}
    />
  );
}
