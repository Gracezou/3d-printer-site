import { z } from 'zod';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('请输入有效的邮箱地址')
  .max(320, '邮箱地址过长');
const phone = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的中国大陆手机号');

export const sendCodeSchema = z.object({ email }).strict();

export const verifyCodeSchema = z
  .object({
    email,
    code: z.string().regex(/^\d{6,10}$/, '验证码必须是 6 至 10 位数字'),
  })
  .strict();

export const customerProfileSchema = z
  .object({
    nickname: z
      .string()
      .trim()
      .max(50, '昵称不能超过 50 个字符')
      .optional()
      .transform((value) => (value === '' ? null : value)),
    phone: z
      .union([phone, z.literal('')])
      .optional()
      .transform((value) => (value === '' ? null : value)),
  })
  .strict();

export type CustomerProfileInput = z.infer<typeof customerProfileSchema>;

export const adminLoginSchema = z
  .object({
    username: z.string().trim().min(1).max(50),
    password: z.string().min(1).max(200),
  })
  .strict();

const adminPassword = z
  .string()
  .min(8, '密码至少 8 个字符')
  .refine(
    (value) => new TextEncoder().encode(value).length <= 72,
    '密码不能超过 72 字节',
  );

export const changeAdminPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newPassword: adminPassword,
  })
  .strict()
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: '新密码不能与当前密码相同',
    path: ['newPassword'],
  });
