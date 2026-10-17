import { requirePermission } from '@/lib/auth/admin';
import { revalidateTag } from 'next/cache';
import { storefrontCacheTags } from '@/lib/storefront-cache';
import { getClientIp } from '@/lib/auth/request';
import {
  ok,
  parseJsonBody,
  parseSearchParams,
  withErrorHandler,
} from '@/lib/api-response';
import { createMaterial, listMaterials } from '@/lib/services/material.service';
import {
  createMaterialSchema,
  materialListQuerySchema,
} from '@/lib/validators/material';

export const GET = withErrorHandler(async (request: Request) => {
  await requirePermission('material:view');
  const query = parseSearchParams(request, materialListQuerySchema);
  return ok(await listMaterials(query));
});

export const POST = withErrorHandler(async (request: Request) => {
  const admin = await requirePermission('material:edit');
  const input = await parseJsonBody(request, createMaterialSchema);
  const material = await createMaterial(input, {
    admin,
    ip: getClientIp(request),
  });
  revalidateTag(storefrontCacheTags.products);
  return ok(material, { status: 201 });
});
