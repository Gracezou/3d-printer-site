import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type UploadBody = ArrayBuffer | Blob | File | Uint8Array;

interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
}

let storageClient: SupabaseClient | undefined;

function getStorageClient(): SupabaseClient {
  if (storageClient) {
    return storageClient;
  }

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for storage',
    );
  }

  storageClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return storageClient;
}

export async function upload(
  bucket: string,
  path: string,
  body: UploadBody,
  options: UploadOptions = {},
): Promise<string> {
  const { data, error } = await getStorageClient()
    .storage.from(bucket)
    .upload(path, body, options);

  if (error) {
    throw error;
  }

  return data.path;
}

export async function remove(bucket: string, path: string): Promise<void> {
  const { error } = await getStorageClient()
    .storage.from(bucket)
    .remove([path]);

  if (error) {
    throw error;
  }
}

export function getPublicUrl(bucket: string, path: string): string {
  return getStorageClient().storage.from(bucket).getPublicUrl(path).data
    .publicUrl;
}

export { remove as delete };
