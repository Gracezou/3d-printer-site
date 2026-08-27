import Decimal from 'decimal.js';

export type DecimalValue = Decimal.Value;

function decimal(value: DecimalValue): Decimal {
  return new Decimal(value);
}

export function add(left: DecimalValue, right: DecimalValue): Decimal {
  return decimal(left).add(right);
}

export function sub(left: DecimalValue, right: DecimalValue): Decimal {
  return decimal(left).sub(right);
}

export function mul(left: DecimalValue, right: DecimalValue): Decimal {
  return decimal(left).mul(right);
}

export function percent(amount: DecimalValue, rate: DecimalValue): Decimal {
  return decimal(amount).mul(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN);
}

export function toFixed2(value: DecimalValue): string {
  return decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
