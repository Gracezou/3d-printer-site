import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/lib/db/client';
import { addresses } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import type { AddressInput } from '@/lib/validators/address';

export interface AddressView {
  id: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  provinceCode: string;
  city: string;
  district: string;
  detail: string;
  postalCode: string | null;
  isDefault: boolean;
}

const addressSelection = {
  id: addresses.id,
  receiverName: addresses.receiverName,
  receiverPhone: addresses.receiverPhone,
  province: addresses.province,
  provinceCode: addresses.provinceCode,
  city: addresses.city,
  district: addresses.district,
  detail: addresses.detail,
  postalCode: addresses.postalCode,
  isDefault: addresses.isDefault,
};

const ownedActiveAddress = (userId: string, addressId: string) =>
  and(
    eq(addresses.id, addressId),
    eq(addresses.userId, userId),
    isNull(addresses.deletedAt),
  );

export async function listAddresses(userId: string): Promise<AddressView[]> {
  return getDb()
    .select(addressSelection)
    .from(addresses)
    .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
    .orderBy(desc(addresses.isDefault), desc(addresses.createdAt));
}

export async function createAddress(
  userId: string,
  input: AddressInput,
): Promise<AddressView> {
  return getDb().transaction(async (tx) => {
    const [firstAddress] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
      .limit(1);
    const shouldBeDefault = input.isDefault || !firstAddress;
    if (shouldBeDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
    }
    const [created] = await tx
      .insert(addresses)
      .values({ ...input, userId, isDefault: shouldBeDefault })
      .returning(addressSelection);
    if (!created) throw new BizError('INTERNAL_ERROR', '地址创建失败');
    return created;
  });
}

export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressInput,
): Promise<AddressView> {
  return getDb().transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(ownedActiveAddress(userId, addressId))
      .limit(1)
      .for('update');
    if (!owned) throw new BizError('ADDRESS_NOT_FOUND', '收货地址不存在');

    const nextDefault = input.isDefault || owned.isDefault;
    if (nextDefault) {
      await tx
        .update(addresses)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
    }
    const [updated] = await tx
      .update(addresses)
      .set({ ...input, isDefault: nextDefault, updatedAt: new Date() })
      .where(ownedActiveAddress(userId, addressId))
      .returning(addressSelection);
    if (!updated) throw new BizError('ADDRESS_NOT_FOUND', '收货地址不存在');
    return updated;
  });
}

export async function setDefaultAddress(
  userId: string,
  addressId: string,
): Promise<AddressView> {
  return getDb().transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: addresses.id })
      .from(addresses)
      .where(ownedActiveAddress(userId, addressId))
      .limit(1)
      .for('update');
    if (!owned) throw new BizError('ADDRESS_NOT_FOUND', '收货地址不存在');
    await tx
      .update(addresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)));
    const [updated] = await tx
      .update(addresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(ownedActiveAddress(userId, addressId))
      .returning(addressSelection);
    return updated!;
  });
}

export async function removeAddress(
  userId: string,
  addressId: string,
): Promise<void> {
  await getDb().transaction(async (tx) => {
    const [owned] = await tx
      .select({ id: addresses.id, isDefault: addresses.isDefault })
      .from(addresses)
      .where(ownedActiveAddress(userId, addressId))
      .limit(1)
      .for('update');
    if (!owned) throw new BizError('ADDRESS_NOT_FOUND', '收货地址不存在');

    const [removed] = await tx
      .update(addresses)
      .set({ deletedAt: new Date(), isDefault: false, updatedAt: new Date() })
      .where(ownedActiveAddress(userId, addressId))
      .returning({ id: addresses.id });
    if (!removed) throw new BizError('ADDRESS_NOT_FOUND', '收货地址不存在');

    if (owned.isDefault) {
      const [replacement] = await tx
        .select({ id: addresses.id })
        .from(addresses)
        .where(and(eq(addresses.userId, userId), isNull(addresses.deletedAt)))
        .orderBy(asc(addresses.createdAt))
        .limit(1)
        .for('update');
      if (replacement) {
        await tx
          .update(addresses)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(ownedActiveAddress(userId, replacement.id));
      }
    }
  });
}
