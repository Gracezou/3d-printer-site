import { AdminAccessManager } from '@/components/admin/admin-access-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function AdminAccessPage() {
  const admin = await requirePermission('admin:view');
  return (
    <AdminAccessManager
      currentAdminId={admin.sub}
      canEditAdmins={hasPermission(admin.permissions, 'admin:edit')}
      canEditRoles={hasPermission(admin.permissions, 'role:edit')}
    />
  );
}
