export const ERROR_DEFINITIONS = {
  PARAM_INVALID: { code: 40001, httpStatus: 400 },
  UNAUTHORIZED: { code: 40101, httpStatus: 401 },
  OTP_INVALID: { code: 40102, httpStatus: 400 },
  OTP_RATE_LIMIT: { code: 40103, httpStatus: 429 },
  ACCOUNT_DISABLED: { code: 40104, httpStatus: 403 },
  ADMIN_LOGIN_FAILED: { code: 40105, httpStatus: 401 },
  ADMIN_LOCKED: { code: 40106, httpStatus: 423 },
  FORBIDDEN: { code: 40301, httpStatus: 403 },
  NOT_FOUND: { code: 40401, httpStatus: 404 },
  PRODUCT_UNAVAILABLE: { code: 40402, httpStatus: 404 },
  ADDRESS_NOT_FOUND: { code: 40403, httpStatus: 404 },
  INSUFFICIENT_MATERIAL: { code: 40901, httpStatus: 409 },
  MATERIAL_INACTIVE: { code: 40902, httpStatus: 409 },
  ORDER_STATUS_INVALID: { code: 40903, httpStatus: 409 },
  ORDER_EXPIRED: { code: 40904, httpStatus: 409 },
  CODE_NOT_FOUND: { code: 40905, httpStatus: 404 },
  CODE_EXPIRED: { code: 40906, httpStatus: 409 },
  CODE_EXHAUSTED: { code: 40907, httpStatus: 409 },
  CODE_USER_LIMIT: { code: 40908, httpStatus: 409 },
  CODE_MIN_AMOUNT: { code: 40909, httpStatus: 409 },
  CART_EMPTY: { code: 40910, httpStatus: 400 },
  VARIANT_NO_BOM: { code: 40911, httpStatus: 409 },
  MATERIAL_IN_USE: { code: 40912, httpStatus: 409 },
  INTERNAL_ERROR: { code: 50000, httpStatus: 500 },
  PAYMENT_PROVIDER_ERROR: { code: 50001, httpStatus: 502 },
} as const;

export type ErrorCode = keyof typeof ERROR_DEFINITIONS;
export type ErrorNumber = (typeof ERROR_DEFINITIONS)[ErrorCode]['code'];

export class BizError extends Error {
  readonly code: ErrorNumber;
  readonly httpStatus: number;
  readonly detail?: Record<string, unknown>;

  constructor(
    errorCode: ErrorCode,
    message: string,
    detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'BizError';
    this.code = ERROR_DEFINITIONS[errorCode].code;
    this.httpStatus = ERROR_DEFINITIONS[errorCode].httpStatus;
    this.detail = detail;
  }
}
