import { describe, expect, it } from 'vitest';

import { parseChineseAddress } from './address-parser';

describe('parseChineseAddress', () => {
  it('parses a regular province address separated by spaces', () => {
    expect(
      parseChineseAddress('张三 13800138000 广东省 深圳市 南山区 科技园1号'),
    ).toMatchObject({
      receiverName: '张三',
      receiverPhone: '13800138000',
      province: '广东省',
      provinceCode: '440000',
      city: '深圳市',
      district: '南山区',
      detail: '科技园1号',
      warnings: [],
    });
  });

  it('parses a municipality and newlines', () => {
    expect(
      parseChineseAddress('李四\n13900139000\n北京市朝阳区望京街道'),
    ).toMatchObject({
      receiverName: '李四',
      province: '北京市',
      city: '北京市',
      district: '朝阳区',
      detail: '望京街道',
    });
  });

  it('keeps uncertain input editable and returns warnings', () => {
    const result = parseChineseAddress('王五 某某路12号');
    expect(result.detail).toBe('王五 某某路12号');
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
