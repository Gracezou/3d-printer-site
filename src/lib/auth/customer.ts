import { eq } from 'drizzle-orm';

import { consumeOtpRateLimit } from '@/lib/auth/otp-rate-limit';
import { createCustomerAuthClient } from '@/lib/auth/supabase-server';
import { getDb } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema';
import { BizError } from '@/lib/errors';
import { logger, maskPhone } from '@/lib/logger';

export interface CustomerIdentity {
  id: string;
  phone: string;
  nickname: string | null;
  avatarUrl: string | null;
}

export async function sendPhoneCode(phone: string, ip: string): Promise<void> {
  consumeOtpRateLimit(phone, ip);
  const supabase = await createCustomerAuthClient();
  const { error } = await supabase.auth.signInWithOtp({ phone });

  if (error) {
    if (error.status === 429) {
      throw new BizError('OTP_RATE_LIMIT', '验证码发送过于频繁，请稍后再试');
    }
    logger.error(
      { err: error, phone: maskPhone(phone) },
      'Failed to send customer OTP',
    );
    throw new BizError('INTERNAL_ERROR', '验证码发送失败，请稍后再试');
  }
}

export async function verifyPhoneCode(
  phone: string,
  token: string,
): Promise<CustomerIdentity & { isNewUser: boolean }> {
  const supabase = await createCustomerAuthClient();
  const { data, error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: 'sms',
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

  await db
    .insert(userProfiles)
    .values({ id: data.user.id, phone, lastLoginAt: new Date() })
    .onConflictDoUpdate({
      target: userProfiles.id,
      set: { phone, lastLoginAt: new Date() },
    });

  return {
    id: data.user.id,
    phone,
    nickname: null,
    avatarUrl: null,
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
      phone: userProfiles.phone,
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

  return profile;
}

export async function logoutCustomer(): Promise<void> {
  const supabase = await createCustomerAuthClient();
  await supabase.auth.signOut();
}
