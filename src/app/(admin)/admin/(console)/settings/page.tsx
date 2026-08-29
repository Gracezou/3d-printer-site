import { SettingsManager } from '@/components/admin/settings-manager';
import { requirePermission } from '@/lib/auth/admin';

export default async function AdminSettingsPage() {
  await requirePermission('settings:edit');
  return <SettingsManager />;
}
