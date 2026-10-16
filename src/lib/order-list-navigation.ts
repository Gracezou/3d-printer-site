const statuses = [
  'all',
  'pending_payment',
  'in_production',
  'shipped',
  'completed',
  'cancelled',
] as const;
export type OrderListStatus = (typeof statuses)[number];

export function parseOrderListQuery(params: Pick<URLSearchParams, 'get'>) {
  const rawStatus = params.get('status');
  const status = statuses.includes(rawStatus as OrderListStatus)
    ? (rawStatus as OrderListStatus)
    : 'all';
  const rawPage = params.get('page') ?? '1';
  const page =
    /^\d+$/.test(rawPage) &&
    Number.isSafeInteger(Number(rawPage)) &&
    Number(rawPage) > 0
      ? Number(rawPage)
      : 1;
  return { status, page };
}

export function orderListHref(status: OrderListStatus = 'all', page = 1) {
  const params = new URLSearchParams();
  if (status !== 'all') params.set('status', status);
  if (page > 1) params.set('page', String(page));
  return `/account/orders${params.size ? `?${params}` : ''}`;
}

// Only the order list and its supported filters may be used as a return target.
export function orderListReturnHref(value: string | null) {
  if (!value?.startsWith('/account/orders?')) return '/account/orders';
  const url = new URL(value, 'https://local.invalid');
  if (
    url.origin !== 'https://local.invalid' ||
    url.pathname !== '/account/orders'
  )
    return '/account/orders';
  const { status, page } = parseOrderListQuery(url.searchParams);
  return orderListHref(status, page);
}
