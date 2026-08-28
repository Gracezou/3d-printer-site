import { requirePermission } from '@/lib/auth/admin';
import { getClientIp } from '@/lib/auth/request';
import { ok, withErrorHandler } from '@/lib/api-response';
import { BizError } from '@/lib/errors';
import { uploadAdminAsset } from '@/lib/services/upload.service';
import type { UploadType } from '@/lib/validators/upload';

export const runtime = 'nodejs';

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('product:edit');
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new BizError('PARAM_INVALID', '请求必须是有效的 multipart/form-data');
  }

  const type = form.get('type');
  if (type !== 'image' && type !== 'model') {
    throw new BizError('PARAM_INVALID', 'type 必须是 image 或 model');
  }
  const file = form.get('file');
  if (!(file instanceof File)) {
    throw new BizError('PARAM_INVALID', '请选择要上传的文件');
  }

  return ok(
    await uploadAdminAsset(file, type as UploadType, {
      admin,
      ip: getClientIp(request),
    }),
    { status: 201 },
  );
});
