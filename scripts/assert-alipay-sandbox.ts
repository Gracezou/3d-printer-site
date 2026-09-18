export function assertAlipaySandboxGateway(value: string | undefined): URL {
  const raw = value?.trim();
  if (!raw) {
    throw new Error(
      'ALIPAY_GATEWAY is required and must use an *.alipaydev.com sandbox host',
    );
  }

  let gateway: URL;
  try {
    gateway = new URL(raw);
  } catch {
    throw new Error('ALIPAY_GATEWAY must be a valid sandbox URL');
  }
  if (
    gateway.protocol !== 'https:' ||
    !gateway.hostname.toLowerCase().endsWith('.alipaydev.com')
  ) {
    throw new Error(
      'ALIPAY_GATEWAY must use HTTPS and an *.alipaydev.com sandbox host',
    );
  }
  return gateway;
}
