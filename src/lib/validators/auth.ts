import { z } from 'zod';

const phone = z.string().regex(/^1[3-9]\d{9}$/, '请输入有效的中国大陆手机号');

export const sendCodeSchema = z.object({ phone }).strict();

export const verifyCodeSchema = z
  .object({
    phone,
    code: z.string().regex(/^\d{6}$/, '验证码必须是 6 位数字'),
  })
  .strict();

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
