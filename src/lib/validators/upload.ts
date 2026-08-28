import { BizError } from '@/lib/errors';

export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const MODEL_MAX_BYTES = 20 * 1024 * 1024;

export type UploadType = 'image' | 'model';

export interface UploadFileLike {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface ValidatedUpload {
  bytes: Uint8Array;
  extension: 'jpg' | 'png' | 'webp' | 'glb';
  contentType: string;
}

function extensionOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && hasPrefix(bytes, [0xff, 0xd8, 0xff]);
}

function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  );
}

function isWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
    hasPrefix(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

function readUint32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
    0
  );
}

function isGlb(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || !hasPrefix(bytes, [0x67, 0x6c, 0x54, 0x46])) {
    return false;
  }
  return (
    readUint32LE(bytes, 4) === 2 && readUint32LE(bytes, 8) === bytes.length
  );
}

export async function validateUploadFile(
  file: UploadFileLike,
  type: UploadType,
): Promise<ValidatedUpload> {
  if (file.size <= 0) {
    throw new BizError('PARAM_INVALID', '上传文件不能为空');
  }
  const maxBytes = type === 'image' ? IMAGE_MAX_BYTES : MODEL_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new BizError(
      'PARAM_INVALID',
      type === 'image' ? '图片不能超过 5MB' : 'GLB 模型不能超过 20MB',
    );
  }

  const extension = extensionOf(file.name);
  const allowed = type === 'image' ? ['jpg', 'jpeg', 'png', 'webp'] : ['glb'];
  if (!allowed.includes(extension)) {
    throw new BizError(
      'PARAM_INVALID',
      type === 'image' ? '图片仅支持 JPG、PNG、WebP' : '模型仅支持 GLB',
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length !== file.size) {
    throw new BizError('PARAM_INVALID', '文件读取不完整');
  }

  if (type === 'model') {
    if (!isGlb(bytes)) {
      throw new BizError('PARAM_INVALID', '文件不是有效的 GLB 2.0 模型');
    }
    return { bytes, extension: 'glb', contentType: 'model/gltf-binary' };
  }

  if ((extension === 'jpg' || extension === 'jpeg') && isJpeg(bytes)) {
    return { bytes, extension: 'jpg', contentType: 'image/jpeg' };
  }
  if (extension === 'png' && isPng(bytes)) {
    return { bytes, extension: 'png', contentType: 'image/png' };
  }
  if (extension === 'webp' && isWebp(bytes)) {
    return { bytes, extension: 'webp', contentType: 'image/webp' };
  }
  throw new BizError('PARAM_INVALID', '文件内容与扩展名不匹配');
}
