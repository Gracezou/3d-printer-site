import { ok, withErrorHandler } from '@/lib/api-response';
import { requireCustomer } from '@/lib/auth/customer';
import { BizError } from '@/lib/errors';
import { consumeReturnEvidenceUploadRateLimit } from '@/lib/return-evidence-rate-limit';
import { uploadReturnEvidence } from '@/lib/services/upload.service';

export const runtime = 'nodejs';

export const POST = withErrorHandler(async (request: Request) => {
  const customer = await requireCustomer();
  consumeReturnEvidenceUploadRateLimit(customer.id);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BizError('PARAM_INVALID', '请求必须是有效的 multipart/form-data');
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new BizError('PARAM_INVALID', '请选择凭证图片');
  }
  return ok(await uploadReturnEvidence(file, customer.id), { status: 201 });
});
