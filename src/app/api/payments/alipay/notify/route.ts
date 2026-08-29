import { logger } from '@/lib/logger';
import { processPaymentNotify } from '@/lib/services/payment-notify.service';
import { getPaymentProvider } from '@/lib/services/payment/provider.factory';

function textResponse(value: 'success' | 'failure'): Response {
  return new Response(value, {
    status: value === 'success' ? 200 : 400,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

export async function POST(request: Request): Promise<Response> {
  try {
    const rawBody = await request.text();
    const provider = getPaymentProvider('alipay_page');
    return textResponse(await processPaymentNotify(provider, rawBody));
  } catch (error: unknown) {
    logger.error({ err: error }, 'Unhandled Alipay notify error');
    return textResponse('failure');
  }
}
