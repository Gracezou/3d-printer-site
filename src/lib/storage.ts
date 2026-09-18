import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type UploadBody = ArrayBuffer | Blob | File | Uint8Array;

interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
}

export interface StorageObjectEntry {
  name: string;
  id: string | null;
  createdAt: string | null;
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

export async function list(
  bucket: string,
  prefix: string,
  limit = 100,
  offset = 0,
): Promise<StorageObjectEntry[]> {
  const { data, error } = await getStorageClient()
    .storage.from(bucket)
    .list(prefix, {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
  if (error) throw error;
  return data.map((entry) => ({
    name: entry.name,
    id: entry.id ?? null,
    createdAt: entry.created_at ?? null,
  }));
}

export async function removeMany(
  bucket: string,
  paths: string[],
): Promise<void> {
  if (!paths.length) return;
  const { error } = await getStorageClient().storage.from(bucket).remove(paths);
  if (error) throw error;
}

export function getPublicUrl(bucket: string, path: string): string {
  return getStorageClient().storage.from(bucket).getPublicUrl(path).data
    .publicUrl;
}

export { remove as delete };
