import { ReturnsManager } from '@/components/admin/returns-manager';
import { requirePermission } from '@/lib/auth/admin';

export default async function AdminReturnsPage() {
  await requirePermission('return:review');
  return <ReturnsManager />;
}
