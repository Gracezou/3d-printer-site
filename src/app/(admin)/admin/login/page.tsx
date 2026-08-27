import { AdminLoginForm } from '@/components/admin/admin-login-form';

interface AdminLoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const params = await searchParams;
  const returnTo = params.next?.startsWith('/admin') ? params.next : '/admin';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-900 px-6 py-16">
      <AdminLoginForm returnTo={returnTo} />
    </main>
  );
}
