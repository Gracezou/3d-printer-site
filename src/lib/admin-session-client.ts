export const ADMIN_UNAUTHORIZED_EVENT = 'admin:unauthorized';

export function notifyAdminUnauthorized(): void {
  window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT));
}
