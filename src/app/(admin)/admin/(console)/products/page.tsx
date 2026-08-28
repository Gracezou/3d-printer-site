import { ProductsManager } from '@/components/admin/products-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function ProductsPage() {
  const admin = await requirePermission('product:view');
  return (
    <ProductsManager
      permissions={{
        edit: hasPermission(admin.permissions, 'product:edit'),
        publish: hasPermission(admin.permissions, 'product:publish'),
      }}
    />
  );
}
