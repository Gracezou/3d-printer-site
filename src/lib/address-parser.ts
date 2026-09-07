export const chinaProvinces = [
  ['北京市', '110000'],
  ['天津市', '120000'],
  ['河北省', '130000'],
  ['山西省', '140000'],
  ['内蒙古自治区', '150000'],
  ['辽宁省', '210000'],
  ['吉林省', '220000'],
  ['黑龙江省', '230000'],
  ['上海市', '310000'],
  ['江苏省', '320000'],
  ['浙江省', '330000'],
  ['安徽省', '340000'],
  ['福建省', '350000'],
  ['江西省', '360000'],
  ['山东省', '370000'],
  ['河南省', '410000'],
  ['湖北省', '420000'],
  ['湖南省', '430000'],
  ['广东省', '440000'],
  ['广西壮族自治区', '450000'],
  ['海南省', '460000'],
  ['重庆市', '500000'],
  ['四川省', '510000'],
  ['贵州省', '520000'],
  ['云南省', '530000'],
  ['西藏自治区', '540000'],
  ['陕西省', '610000'],
  ['甘肃省', '620000'],
  ['青海省', '630000'],
  ['宁夏回族自治区', '640000'],
  ['新疆维吾尔自治区', '650000'],
  ['台湾省', '710000'],
  ['香港特别行政区', '810000'],
  ['澳门特别行政区', '820000'],
] as const;

export interface ParsedAddress {
  receiverName?: string;
  receiverPhone?: string;
  province?: string;
  provinceCode?: string;
  city?: string;
  district?: string;
  detail?: string;
  postalCode?: string;
  warnings: string[];
}

const municipalities = new Set(['北京市', '天津市', '上海市', '重庆市']);

function aliases(name: string): string[] {
  const short = name.replace(
    /特别行政区|壮族自治区|维吾尔自治区|回族自治区|自治区|省|市$/u,
    '',
  );
  return [...new Set([name, short])].sort((a, b) => b.length - a.length);
}

export function parseChineseAddress(source: string): ParsedAddress {
  const warnings: string[] = [];
  const normalized = source
    .replace(/[，,;；|]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return { warnings: ['请先粘贴收货信息'] };

  const phone = normalized.match(/(?<!\d)(1[3-9]\d{9})(?!\d)/u)?.[1];
  const postalCode = normalized.match(/(?:邮编|邮政编码)[:：\s]*(\d{6})/u)?.[1];
  let content = normalized
    .replace(/(?:邮编|邮政编码)[:：\s]*\d{6}/gu, ' ')
    .replace(phone ?? /$^/u, ' ')
    .replace(/\s+/gu, ' ')
    .trim();

  const matches = chinaProvinces
    .flatMap(([name, code]) =>
      aliases(name).map((alias) => ({
        name,
        code,
        alias,
        index: content.indexOf(alias),
      })),
    )
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index || b.alias.length - a.alias.length);
  const provinceMatch = matches[0];
  if (!phone) warnings.push('未识别到中国大陆手机号码');
  if (!provinceMatch) {
    warnings.push('未识别到省份，请手动补充省市区');
    return {
      receiverPhone: phone,
      postalCode,
      detail: content || undefined,
      warnings,
    };
  }

  const namePart = content.slice(0, provinceMatch.index).trim();
  content = content
    .slice(provinceMatch.index + provinceMatch.alias.length)
    .replace(/\s+/gu, '');
  const receiverName = namePart && namePart.length <= 20 ? namePart : undefined;
  if (!receiverName) warnings.push('未可靠识别收货人姓名');

  let city: string | undefined;
  if (municipalities.has(provinceMatch.name)) {
    city = provinceMatch.name;
  } else {
    const cityMatch = content.match(/^(.{2,12}?(?:市|自治州|地区|盟))/u);
    city = cityMatch?.[1];
    if (city) content = content.slice(city.length);
  }

  const districtMatch = content.match(/^(.{2,12}?(?:区|县|旗))/u);
  const district = districtMatch?.[1];
  if (district) content = content.slice(district.length);
  if (!city) warnings.push('未识别到城市');
  if (!district) warnings.push('未识别到区县');
  if (!content) warnings.push('未识别到详细地址');

  return {
    receiverName,
    receiverPhone: phone,
    province: provinceMatch.name,
    provinceCode: provinceMatch.code,
    city,
    district,
    detail: content || undefined,
    postalCode,
    warnings,
  };
}
