import { UsersManager } from '@/components/admin/users-manager';
import { requirePermission } from '@/lib/auth/admin';
import { hasPermission } from '@/lib/auth/permissions';

export default async function AdminUsersPage() {
  const admin = await requirePermission('user:view');
  return (
    <UsersManager
      canDisable={hasPermission(admin.permissions, 'user:disable')}
    />
  );
}
