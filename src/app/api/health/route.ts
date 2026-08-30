import { NextResponse } from 'next/server';

import { checkDatabaseConnection } from '@/lib/db/client';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();

  try {
    await checkDatabaseConnection();

    return NextResponse.json(
      {
        status: 'ok',
        version: process.env.APP_VERSION ?? 'development',
        database: 'ok',
        responseTimeMs: Date.now() - startedAt,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error: unknown) {
    logger.error({ err: error }, 'Health check database query failed');

    return NextResponse.json(
      {
        status: 'unavailable',
        version: process.env.APP_VERSION ?? 'development',
        database: 'unavailable',
        responseTimeMs: Date.now() - startedAt,
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
