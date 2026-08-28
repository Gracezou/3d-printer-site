import { z } from 'zod';

const requiredText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `请输入${label}`)
    .max(max, `${label}不能超过 ${max} 个字符`);

export const addressInputSchema = z
  .object({
    receiverName: requiredText('收货人姓名', 50),
    receiverPhone: z
      .string()
      .trim()
      .regex(/^1[3-9]\d{9}$/, '请输入有效的中国大陆手机号'),
    province: requiredText('省份', 50),
    provinceCode: z
      .string()
      .trim()
      .min(1, '请输入省份代码')
      .max(10, '省份代码不能超过 10 个字符'),
    city: requiredText('城市', 50),
    district: requiredText('区县', 50),
    detail: requiredText('详细地址', 200),
    postalCode: z
      .string()
      .trim()
      .max(10, '邮政编码不能超过 10 个字符')
      .optional()
      .transform((value) => value || null),
    isDefault: z.boolean().optional().default(false),
  })
  .strict();

export const addressIdSchema = z.string().uuid('地址 ID 无效');

export type AddressInput = z.infer<typeof addressInputSchema>;
