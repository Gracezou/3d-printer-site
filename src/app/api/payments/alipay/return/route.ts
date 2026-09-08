import { NextResponse } from 'next/server';

import { outTradeNoSchema } from '@/lib/validators/payment';

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const parsed = outTradeNoSchema.safeParse(
    requestUrl.searchParams.get('out_trade_no'),
  );
  const publicSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const target = new URL(
    '/checkout/pay/result',
    publicSiteUrl || requestUrl.origin,
  );
  if (parsed.success) target.searchParams.set('outTradeNo', parsed.data);
  return NextResponse.redirect(target);
}
