import { LoginForm } from '@/components/shop/login-form';

interface LoginPageProps {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const returnTo =
    params.next?.startsWith('/') && !params.next.startsWith('//')
      ? params.next
      : '/';

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6 py-16">
      <LoginForm returnTo={returnTo} />
    </main>
  );
}
