import { ProductEditor } from '@/components/admin/product-editor';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';
import { productIdSchema } from '@/lib/validators/product';

interface ProductEditorPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductEditorPage({
  params,
}: ProductEditorPageProps) {
  const admin = await requirePermission('product:edit');
  const productId = productIdSchema.parse((await params).id);
  return (
    <ProductEditor
      productId={productId}
      canPublish={hasPermission(admin.permissions, 'product:publish')}
    />
  );
}
