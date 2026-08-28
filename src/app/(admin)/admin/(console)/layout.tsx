import type { ReactNode } from 'react';

import { AdminShell } from '@/components/admin/admin-shell';
import { requireAdmin } from '@/lib/auth/admin';

export default async function AdminConsoleLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const admin = await requireAdmin();

  return (
    <AdminShell
      admin={{
        name: admin.name,
        username: admin.username,
        roleCode: admin.roleCode,
      }}
    >
      {children}
    </AdminShell>
  );
}
