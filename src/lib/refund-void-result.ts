export type RefundVoidStatus = 'failed' | 'success';

export function refundVoidSuccessMessage(status: RefundVoidStatus): string {
  return status === 'success'
    ? '渠道已确认出款，本地退款已完成落账'
    : '退款已作废，订单状态已恢复';
}

export function refundVoidErrorMessage(code: number, fallback: string): string {
  if (code === 40920) {
    return '退款仍在冷却或处理中，请稍后再核实';
  }
  if (code === 40923) {
    return '渠道结果仍不确定，需继续人工复核';
  }
  return fallback;
}
