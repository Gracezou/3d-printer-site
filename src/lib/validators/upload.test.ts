import { describe, expect, it } from 'vitest';

import {
  IMAGE_MAX_BYTES,
  validateUploadFile,
  type UploadFileLike,
} from '@/lib/validators/upload';

function file(name: string, bytes: number[]): UploadFileLike {
  const data = new Uint8Array(bytes);
  return {
    name,
    size: data.length,
    arrayBuffer: async () => data.buffer,
  };
}

describe('upload magic-number validation', () => {
  it('recognizes supported image signatures', async () => {
    await expect(
      validateUploadFile(file('photo.jpg', [0xff, 0xd8, 0xff, 0xe0]), 'image'),
    ).resolves.toMatchObject({ extension: 'jpg', contentType: 'image/jpeg' });
    await expect(
      validateUploadFile(
        file('image.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        'image',
      ),
    ).resolves.toMatchObject({ extension: 'png', contentType: 'image/png' });
    await expect(
      validateUploadFile(
        file(
          'image.webp',
          [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
        ),
        'image',
      ),
    ).resolves.toMatchObject({ extension: 'webp', contentType: 'image/webp' });
  });

  it('recognizes a GLB 2.0 header and declared length', async () => {
    await expect(
      validateUploadFile(
        file('model.glb', [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0]),
        'model',
      ),
    ).resolves.toMatchObject({
      extension: 'glb',
      contentType: 'model/gltf-binary',
    });
  });

  it('rejects an executable renamed to jpg regardless of MIME claims', async () => {
    await expect(
      validateUploadFile(file('malware.jpg', [0x4d, 0x5a, 0x90, 0]), 'image'),
    ).rejects.toMatchObject({
      code: 40001,
      message: '文件内容与扩展名不匹配',
    });
  });

  it('rejects files over the image limit before reading bytes', async () => {
    const oversized: UploadFileLike = {
      name: 'huge.png',
      size: IMAGE_MAX_BYTES + 1,
      arrayBuffer: async () => {
        throw new Error('should not read oversized file');
      },
    };
    await expect(validateUploadFile(oversized, 'image')).rejects.toMatchObject({
      message: '图片不能超过 5MB',
    });
  });
});
