import { DevicesManager } from '@/components/admin/devices-manager';
import { requirePermission } from '@/lib/auth/admin';

export default async function DevicesPage() {
  await requirePermission('device:manage');
  return <DevicesManager />;
}
