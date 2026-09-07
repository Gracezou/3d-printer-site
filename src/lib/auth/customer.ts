import { eq } from 'drizzle-orm';

import { consumeOtpRateLimit } from '@/lib/auth/otp-rate-limit';
import { createCustomerAuthClient } from '@/lib/auth/supabase-server';
import { getDb } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger, maskEmail } from '@/lib/logger';
import type { CustomerProfileInput } from '@/lib/validators/auth';

export interface CustomerIdentity {
  id: string;
  email: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  nickname: string | null;
  avatarUrl: string | null;
}

export async function sendEmailCode(email: string, ip: string): Promise<void> {
  consumeOtpRateLimit(email, ip);
  const supabase = await createCustomerAuthClient();
  const { error } = await supabase.auth.signInWithOtp({ email });

  if (error) {
    if (error.status === 429) {
      throw new BizError('OTP_RATE_LIMIT', '验证码发送过于频繁，请稍后再试');
    }
    logger.error(
      { err: error, email: maskEmail(email) },
      'Failed to send customer email OTP',
    );
    throw new BizError('INTERNAL_ERROR', '验证码发送失败，请稍后再试');
  }
}

export async function verifyEmailCode(
  email: string,
  token: string,
): Promise<CustomerIdentity & { isNewUser: boolean }> {
  const supabase = await createCustomerAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error || !data.user) {
    throw new BizError('OTP_INVALID', '验证码错误或已过期');
  }

  const db = getDb();
  const existing = await db
    .select({ id: userProfiles.id, status: userProfiles.status })
    .from(userProfiles)
    .where(eq(userProfiles.id, data.user.id))
    .limit(1);
  const isNewUser = existing.length === 0;

  if (existing[0]?.status === 'disabled') {
    await supabase.auth.signOut();
    throw new BizError('ACCOUNT_DISABLED', '账号已被禁用');
  }

  const [profile] = await db
    .insert(userProfiles)
    .values({ id: data.user.id, email, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.id,
      set: { email, lastLoginAt: new Date(), updatedAt: new Date() },
    })
    .returning({
      id: userProfiles.id,
      email: userProfiles.email,
      phone: userProfiles.phone,
      phoneVerifiedAt: userProfiles.phoneVerifiedAt,
      nickname: userProfiles.nickname,
      avatarUrl: userProfiles.avatarUrl,
    });

  if (!profile?.email) {
    throw new BizError('INTERNAL_ERROR', '用户档案创建失败');
  }

  return {
    ...profile,
    email: profile.email,
    isNewUser,
  };
}

export async function requireCustomer(): Promise<CustomerIdentity> {
  const supabase = await createCustomerAuthClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new BizError('UNAUTHORIZED', '请先登录');
  }

  return getActiveCustomerIdentity(data.user.id);
}

export async function getActiveCustomerIdentity(
  userId: string,
): Promise<CustomerIdentity> {
  const [profile] = await getDb()
    .select({
      id: userProfiles.id,
      email: userProfiles.email,
      phone: userProfiles.phone,
      phoneVerifiedAt: userProfiles.phoneVerifiedAt,
      nickname: userProfiles.nickname,
      avatarUrl: userProfiles.avatarUrl,
      status: userProfiles.status,
    })
    .from(userProfiles)
    .where(eq(userProfiles.id, userId))
    .limit(1);

  if (!profile) {
    throw new BizError('UNAUTHORIZED', '用户档案不存在');
  }
  if (profile.status === 'disabled') {
    throw new BizError('ACCOUNT_DISABLED', '账号已被禁用');
  }
  if (!profile.email) {
    throw new BizError('UNAUTHORIZED', '用户邮箱档案不存在');
  }

  return { ...profile, email: profile.email };
}

export async function updateCustomerProfile(
  userId: string,
  input: CustomerProfileInput,
): Promise<CustomerIdentity> {
  const updates: {
    nickname?: string | null;
    phone?: string | null;
    phoneVerifiedAt?: null;
    updatedAt: Date;
  } = { updatedAt: new Date() };
  if (input.nickname !== undefined) updates.nickname = input.nickname;
  if (input.phone !== undefined) {
    updates.phone = input.phone;
    updates.phoneVerifiedAt = null;
  }

  const [profile] = await getDb()
    .update(userProfiles)
    .set(updates)
    .where(eq(userProfiles.id, userId))
    .returning({
      id: userProfiles.id,
      email: userProfiles.email,
      phone: userProfiles.phone,
      phoneVerifiedAt: userProfiles.phoneVerifiedAt,
      nickname: userProfiles.nickname,
      avatarUrl: userProfiles.avatarUrl,
    });
  if (!profile?.email) throw new BizError('NOT_FOUND', '用户档案不存在');
  return { ...profile, email: profile.email };
}

export async function logoutCustomer(): Promise<void> {
  const supabase = await createCustomerAuthClient();
  await supabase.auth.signOut();
}
