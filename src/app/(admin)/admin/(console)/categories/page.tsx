import { CategoriesManager } from '@/components/admin/categories-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function CategoriesPage() {
  const admin = await requirePermission('category:view');
  return (
    <CategoriesManager
      canEdit={hasPermission(admin.permissions, 'category:edit')}
    />
  );
}
