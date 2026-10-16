import { AccountNavigation } from '@/components/shop/account-navigation';

export default function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AccountNavigation />
      {children}
    </>
  );
}
