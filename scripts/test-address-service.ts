import assert from 'node:assert/strict';

import { inArray } from 'drizzle-orm';

import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import {
  createAddress,
  listAddresses,
  removeAddress,
  setDefaultAddress,
  updateAddress,
} from '@/lib/services/address.service';
import type { AddressInput } from '@/lib/validators/address';

const baseAddress: AddressInput = {
  receiverName: '测试用户',
  receiverPhone: '13800138000',
  province: '广东省',
  provinceCode: '440000',
  city: '深圳市',
  district: '南山区',
  detail: '科技园测试路 1 号',
  postalCode: '518000',
  isDefault: false,
};

async function expectNotFound(action: () => Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert(error instanceof BizError);
    assert.equal(error.code, 40403);
    return true;
  });
}

async function main(): Promise<void> {
  const db = getDb();
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
  const firstUserId = crypto.randomUUID();
  const secondUserId = crypto.randomUUID();

  try {
    await db.insert(userProfiles).values([
      { id: firstUserId, phone: `136${suffix}` },
      { id: secondUserId, phone: `137${suffix}` },
    ]);

    const first = await createAddress(firstUserId, baseAddress);
    assert.equal(first.isDefault, true, '首个地址应自动成为默认地址');
    const second = await createAddress(firstUserId, {
      ...baseAddress,
      receiverName: '第二地址',
      detail: '测试路 2 号',
    });
    assert.equal(second.isDefault, false);

    await expectNotFound(() =>
      updateAddress(secondUserId, first.id, {
        ...baseAddress,
        receiverName: '越权修改',
      }),
    );
    await expectNotFound(() => setDefaultAddress(secondUserId, second.id));
    await expectNotFound(() => removeAddress(secondUserId, second.id));

    await setDefaultAddress(firstUserId, second.id);
    const afterDefault = await listAddresses(firstUserId);
    assert.equal(afterDefault.filter((item) => item.isDefault).length, 1);
    assert.equal(afterDefault[0]?.id, second.id);

    const updated = await updateAddress(firstUserId, first.id, {
      ...baseAddress,
      receiverName: '已更新地址',
    });
    assert.equal(updated.receiverName, '已更新地址');

    await removeAddress(firstUserId, second.id);
    const remaining = await listAddresses(firstUserId);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0]?.id, first.id);
    assert.equal(remaining[0]?.isDefault, true, '删除默认地址后应自动补位');

    await removeAddress(firstUserId, first.id);
    assert.deepEqual(await listAddresses(firstUserId), []);
    console.info(
      'T051 地址服务测试通过：用户隔离、默认地址唯一、软删除与默认补位均符合预期。',
    );
  } finally {
    await db
      .delete(userProfiles)
      .where(inArray(userProfiles.id, [firstUserId, secondUserId]));
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
