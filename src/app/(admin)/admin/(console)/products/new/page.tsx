import { ProductEditor } from '@/components/admin/product-editor';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function NewProductPage() {
  const admin = await requirePermission('product:edit');
  return (
    <ProductEditor
      productId={null}
      canPublish={hasPermission(admin.permissions, 'product:publish')}
    />
  );
}
