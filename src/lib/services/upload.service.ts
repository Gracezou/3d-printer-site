import type { AdminIdentity } from '@/lib/auth/admin';
import { BizError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { withAdminLog } from '@/lib/services/admin-log.service';
import {
  delete as deleteStorageObject,
  getPublicUrl,
  list as listStorageObjects,
  removeMany as removeStorageObjects,
  upload,
} from '@/lib/storage';
import {
  type UploadFileLike,
  type UploadType,
  validateUploadFile,
} from '@/lib/validators/upload';

interface UploadContext {
  admin: AdminIdentity;
  ip: string;
}

function storagePath(type: UploadType, extension: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const directory = type === 'image' ? 'images' : 'models';
  return `${directory}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

function returnEvidencePath(userId: string, extension: string): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `returns/${userId}/${year}/${month}/${crypto.randomUUID()}.${extension}`;
}

export async function uploadReturnEvidence(
  file: UploadFileLike,
  userId: string,
): Promise<{ url: string }> {
  const validated = await validateUploadFile(file, 'image');
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
  const path = returnEvidencePath(userId, validated.extension);
  await upload(bucket, path, validated.bytes, {
    contentType: validated.contentType,
    upsert: false,
  });
  return { url: getPublicUrl(bucket, path) };
}

export interface ReturnEvidenceObject {
  path: string;
  createdAt: Date | null;
}

export async function listReturnEvidenceObjects(
  maxFiles = 100,
): Promise<ReturnEvidenceObject[]> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
  const queue = ['returns'];
  const files: ReturnEvidenceObject[] = [];
  let scannedDirectories = 0;

  while (queue.length && files.length < maxFiles && scannedDirectories < 1_000) {
    const prefix = queue.shift()!;
    scannedDirectories += 1;
    let offset = 0;
    for (;;) {
      const entries = await listStorageObjects(bucket, prefix, 100, offset);
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        if (entry.id === null) queue.push(path);
        else {
          files.push({
            path,
            createdAt: entry.createdAt ? new Date(entry.createdAt) : null,
          });
          if (files.length >= maxFiles) return files;
        }
      }
      if (entries.length < 100) break;
      offset += entries.length;
    }
  }
  return files;
}

export function getReturnEvidencePublicUrl(path: string): string {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
  return getPublicUrl(bucket, path);
}

export async function removeReturnEvidenceObjects(paths: string[]): Promise<void> {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
  await removeStorageObjects(bucket, paths);
}

export async function uploadAdminAsset(
  file: UploadFileLike,
  type: UploadType,
  context: UploadContext,
): Promise<{ url: string }> {
  const validated = await validateUploadFile(file, type);
  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? 'products';
  const path = storagePath(type, validated.extension);
  let uploaded = false;

  try {
    await upload(bucket, path, validated.bytes, {
      contentType: validated.contentType,
      upsert: false,
    });
    uploaded = true;
    return await withAdminLog(
      async () => ({ url: getPublicUrl(bucket, path) }),
      {
        adminId: context.admin.sub,
        adminName: context.admin.name,
        action: 'storage.upload',
        targetType: 'storage_object',
        targetId: path,
        payload: {
          type,
          size: file.size,
          contentType: validated.contentType,
        },
        ip: context.ip,
      },
    );
  } catch (error: unknown) {
    if (uploaded) {
      try {
        await deleteStorageObject(bucket, path);
      } catch (cleanupError: unknown) {
        logger.error(
          { err: cleanupError, bucket, path },
          'Failed to clean up uploaded object after audit failure',
        );
      }
    }
    if (error instanceof BizError) throw error;
    logger.error({ err: error, bucket }, 'Storage upload failed');
    throw new BizError('INTERNAL_ERROR', '文件上传失败，请稍后重试');
  }
}
