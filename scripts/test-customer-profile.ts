import assert from 'node:assert/strict';

import { eq } from 'drizzle-orm';

import {
  getActiveCustomerIdentity,
  updateCustomerProfile,
} from '@/lib/auth/customer';
import { closeDatabaseConnection, getDb } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';

async function main(): Promise<void> {
  const db = getDb();
  const userId = crypto.randomUUID();
  const email = `profile-${userId.slice(0, 8)}@example.test`;

  try {
    await db.insert(userProfiles).values({ id: userId, email });

    const saved = await updateCustomerProfile(userId, {
      nickname: '测试用户',
      phone: '13800138000',
    });
    assert.equal(saved.email, email);
    assert.equal(saved.nickname, '测试用户');
    assert.equal(saved.phone, '13800138000');
    assert.equal(saved.phoneVerifiedAt, null);

    const nicknameOnly = await updateCustomerProfile(userId, {
      nickname: '新昵称',
    });
    assert.equal(nicknameOnly.nickname, '新昵称');
    assert.equal(nicknameOnly.phone, '13800138000');

    const cleared = await updateCustomerProfile(userId, { phone: null });
    assert.equal(cleared.phone, null);
    assert.equal((await getActiveCustomerIdentity(userId)).email, email);

    process.stdout.write(
      '客户资料功能测试通过：邮箱身份、联系电话保存/清空与 PATCH 局部更新均符合预期。\n',
    );
  } finally {
    await db.delete(userProfiles).where(eq(userProfiles.id, userId));
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
