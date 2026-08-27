import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { BizError, ERROR_DEFINITIONS } from '@/lib/errors';
import { logger } from '@/lib/logger';

interface ApiSuccess<T> {
  code: 0;
  data: T;
  message: '';
}

interface ApiFailure {
  code: number;
  data: null;
  message: string;
}

export function ok<T>(
  data: T,
  init?: ResponseInit,
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ code: 0, data, message: '' }, init);
}

export function fail(error: BizError): NextResponse<ApiFailure> {
  return NextResponse.json(
    { code: error.code, data: null, message: error.message },
    { status: error.httpStatus },
  );
}

type RouteHandler<TArgs extends unknown[]> = (
  ...args: TArgs
) => Response | Promise<Response>;

export function withErrorHandler<TArgs extends unknown[]>(
  handler: RouteHandler<TArgs>,
): RouteHandler<TArgs> {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error: unknown) {
      if (error instanceof BizError) {
        return fail(error);
      }

      if (error instanceof ZodError) {
        return fail(
          new BizError('PARAM_INVALID', '参数校验失败', {
            issues: error.issues,
          }),
        );
      }

      logger.error({ err: error }, 'Unhandled route error');
      const fallback = ERROR_DEFINITIONS.INTERNAL_ERROR;
      return NextResponse.json(
        { code: fallback.code, data: null, message: '服务器错误' },
        { status: fallback.httpStatus },
      );
    }
  };
}
