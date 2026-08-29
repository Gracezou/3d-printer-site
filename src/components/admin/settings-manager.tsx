'use client';

import {
  GripVertical,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Truck,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

interface Banner {
  title: string;
  subtitle: string;
  imageUrl: string | null;
  linkUrl: string;
  buttonText: string;
}

interface SiteInfo {
  name: string;
  description: string;
  contact: string;
  about: string;
}

interface SiteSettings {
  siteBanners: Banner[];
  siteInfo: SiteInfo;
}

interface ShippingRule {
  id?: string;
  name: string;
  provinceCodes: string[];
  firstWeightGrams: string;
  firstAmount: string;
  additionalWeightGrams: string;
  additionalAmount: string;
  freeThreshold: string | null;
  isActive: boolean;
  sortOrder: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const emptyBanner: Banner = {
  title: '',
  subtitle: '',
  imageUrl: null,
  linkUrl: '/products',
  buttonText: '查看详情',
};

const emptyRule: ShippingRule = {
  name: '',
  provinceCodes: [],
  firstWeightGrams: '1000',
  firstAmount: '10.00',
  additionalWeightGrams: '500',
  additionalAmount: '3.00',
  freeThreshold: '199.00',
  isActive: true,
  sortOrder: 0,
};

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
    cache: 'no-store',
  });
  const result = (await response.json()) as ApiEnvelope<T>;
  if (response.status === 401) {
    window.location.assign('/admin/login');
    throw new Error('后台登录已失效');
  }
  if (!response.ok || result.data === null) {
    throw new Error(result.message || '请求失败');
  }
  return result.data;
}

export function SettingsManager() {
  const [tab, setTab] = useState<'site' | 'shipping'>('site');
  const [site, setSite] = useState<SiteSettings | null>(null);
  const [rules, setRules] = useState<ShippingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [siteData, shippingData] = await Promise.all([
        apiRequest<SiteSettings>('/api/admin/settings'),
        apiRequest<ShippingRule[]>('/api/admin/shipping-rules'),
      ]);
      setSite(siteData);
      setRules(shippingData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '配置加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function updateBanner(index: number, patch: Partial<Banner>) {
    setSite((current) =>
      current
        ? {
            ...current,
            siteBanners: current.siteBanners.map((banner, itemIndex) =>
              itemIndex === index ? { ...banner, ...patch } : banner,
            ),
          }
        : current,
    );
  }

  function updateRule(index: number, patch: Partial<ShippingRule>) {
    setRules((current) =>
      current.map((rule, itemIndex) =>
        itemIndex === index ? { ...rule, ...patch } : rule,
      ),
    );
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    if (!site) return;
    setBusy('site');
    setError('');
    try {
      const saved = await apiRequest<SiteSettings>('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(site),
      });
      setSite(saved);
      setNotice('站点信息与 Banner 已保存，首页缓存已刷新');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function saveRules(event: FormEvent) {
    event.preventDefault();
    setBusy('shipping');
    setError('');
    try {
      const saved = await apiRequest<ShippingRule[]>(
        '/api/admin/shipping-rules',
        { method: 'PUT', body: JSON.stringify({ rules }) },
      );
      setRules(saved);
      setNotice('运费规则已保存，新试算与新订单将立即使用');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-lime-700">
            SITE CONFIGURATION
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">站点配置</h1>
          <p className="mt-1 text-sm text-zinc-500">
            配置首页展示信息，以及下单时实时生效的运费规则。
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-800">
          {notice}
        </div>
      ) : null}

      <div className="flex gap-2 rounded-2xl border border-zinc-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setTab('site')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === 'site' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <Settings className="size-4" /> 站点与 Banner
        </button>
        <button
          type="button"
          onClick={() => setTab('shipping')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === 'shipping' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <Truck className="size-4" /> 运费规则
        </button>
      </div>

      {tab === 'site' && site ? (
        <form onSubmit={(event) => void saveSite(event)} className="space-y-6">
          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <h2 className="text-lg font-semibold">站点信息</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                站点名称
                <input
                  required
                  maxLength={80}
                  value={site.siteInfo.name}
                  onChange={(event) =>
                    setSite({
                      ...site,
                      siteInfo: { ...site.siteInfo, name: event.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                联系方式
                <input
                  maxLength={200}
                  value={site.siteInfo.contact}
                  onChange={(event) =>
                    setSite({
                      ...site,
                      siteInfo: {
                        ...site.siteInfo,
                        contact: event.target.value,
                      },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                站点描述
                <textarea
                  required
                  maxLength={300}
                  rows={2}
                  value={site.siteInfo.description}
                  onChange={(event) =>
                    setSite({
                      ...site,
                      siteInfo: {
                        ...site.siteInfo,
                        description: event.target.value,
                      },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="text-sm sm:col-span-2">
                关于我们
                <textarea
                  maxLength={1000}
                  rows={4}
                  value={site.siteInfo.about}
                  onChange={(event) =>
                    setSite({
                      ...site,
                      siteInfo: { ...site.siteInfo, about: event.target.value },
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">首页 Banner</h2>
                <p className="mt-1 text-xs text-zinc-400">
                  最多 10 张，按当前顺序轮播；图片留空时使用默认视觉背景。
                </p>
              </div>
              <button
                type="button"
                disabled={site.siteBanners.length >= 10}
                onClick={() =>
                  setSite({
                    ...site,
                    siteBanners: [...site.siteBanners, { ...emptyBanner }],
                  })
                }
                className="flex items-center gap-2 rounded-xl bg-lime-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <Plus className="size-4" />
                添加 Banner
              </button>
            </div>
            <div className="mt-5 space-y-4">
              {site.siteBanners.map((banner, index) => (
                <article
                  key={index}
                  className="rounded-2xl border border-zinc-200 p-4"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <GripVertical className="size-4 text-zinc-300" />
                      Banner {index + 1}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setSite({
                          ...site,
                          siteBanners: site.siteBanners.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                      className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm sm:col-span-2">
                      标题
                      <input
                        required
                        maxLength={100}
                        value={banner.title}
                        onChange={(event) =>
                          updateBanner(index, { title: event.target.value })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      副标题
                      <textarea
                        maxLength={300}
                        rows={2}
                        value={banner.subtitle}
                        onChange={(event) =>
                          updateBanner(index, { subtitle: event.target.value })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm sm:col-span-2">
                      <span className="flex items-center gap-1">
                        <ImagePlus className="size-4" />
                        图片地址
                      </span>
                      <input
                        placeholder="https://... 或 /images/..."
                        value={banner.imageUrl ?? ''}
                        onChange={(event) =>
                          updateBanner(index, {
                            imageUrl: event.target.value.trim() || null,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      跳转链接
                      <input
                        required
                        value={banner.linkUrl}
                        onChange={(event) =>
                          updateBanner(index, { linkUrl: event.target.value })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                      />
                    </label>
                    <label className="text-sm">
                      按钮文字
                      <input
                        required
                        maxLength={30}
                        value={banner.buttonText}
                        onChange={(event) =>
                          updateBanner(index, {
                            buttonText: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                      />
                    </label>
                  </div>
                </article>
              ))}
              {!site.siteBanners.length ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-400">
                  未配置 Banner，首页将展示系统默认 Banner。
                </div>
              ) : null}
            </div>
          </section>
          <div className="flex justify-end">
            <button
              disabled={busy === 'site'}
              className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'site' ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存站点配置
            </button>
          </div>
        </form>
      ) : null}

      {tab === 'shipping' ? (
        <form onSubmit={(event) => void saveRules(event)} className="space-y-5">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
            省份编码为空的规则是全国兜底规则，必须且只能启用一条。数字越小优先级越高；商品小计达到包邮门槛时运费为
            0。
          </div>
          {rules.map((rule, index) => (
            <section
              key={rule.id ?? `new-${index}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-zinc-100 text-sm font-semibold">
                    {index + 1}
                  </span>
                  <div>
                    <h2 className="font-semibold">
                      {rule.name || '新运费规则'}
                    </h2>
                    <p className="text-xs text-zinc-400">
                      {rule.provinceCodes.length
                        ? `${rule.provinceCodes.length} 个指定省份`
                        : '全国兜底'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={rule.isActive}
                      onChange={(event) =>
                        updateRule(index, { isActive: event.target.checked })
                      }
                      className="accent-zinc-900"
                    />
                    启用
                  </label>
                  <button
                    type="button"
                    disabled={rules.length <= 1}
                    onClick={() =>
                      setRules((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm sm:col-span-2">
                  规则名称
                  <input
                    required
                    maxLength={50}
                    value={rule.name}
                    onChange={(event) =>
                      updateRule(index, { name: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  优先级
                  <input
                    required
                    type="number"
                    min={-10000}
                    max={10000}
                    value={rule.sortOrder}
                    onChange={(event) =>
                      updateRule(index, {
                        sortOrder: Number(event.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  包邮门槛（元）
                  <input
                    inputMode="decimal"
                    placeholder="留空表示不包邮"
                    value={rule.freeThreshold ?? ''}
                    onChange={(event) =>
                      updateRule(index, {
                        freeThreshold: event.target.value || null,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2 lg:col-span-4">
                  省份行政区划代码
                  <input
                    placeholder="例如 440000, 310000；留空为全国兜底"
                    value={rule.provinceCodes.join(', ')}
                    onChange={(event) =>
                      updateRule(index, {
                        provinceCodes: event.target.value
                          .split(/[,，\s]+/)
                          .map((value) => value.trim())
                          .filter(Boolean),
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                  <span className="mt-1 block text-xs text-zinc-400">
                    使用 6 位省级行政区划代码，多个代码用逗号分隔。
                  </span>
                </label>
                <label className="text-sm">
                  首重（克）
                  <input
                    required
                    inputMode="decimal"
                    value={rule.firstWeightGrams}
                    onChange={(event) =>
                      updateRule(index, {
                        firstWeightGrams: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  首重金额（元）
                  <input
                    required
                    inputMode="decimal"
                    value={rule.firstAmount}
                    onChange={(event) =>
                      updateRule(index, { firstAmount: event.target.value })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  续重单位（克）
                  <input
                    required
                    inputMode="decimal"
                    value={rule.additionalWeightGrams}
                    onChange={(event) =>
                      updateRule(index, {
                        additionalWeightGrams: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  每续重金额（元）
                  <input
                    required
                    inputMode="decimal"
                    value={rule.additionalAmount}
                    onChange={(event) =>
                      updateRule(index, {
                        additionalAmount: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                </label>
              </div>
            </section>
          ))}
          <div className="flex flex-wrap justify-between gap-3">
            <button
              type="button"
              disabled={rules.length >= 100}
              onClick={() =>
                setRules((current) => [
                  ...current,
                  { ...emptyRule, sortOrder: current.length * 10 },
                ])
              }
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium"
            >
              <Plus className="size-4" />
              添加规则
            </button>
            <button
              disabled={busy === 'shipping'}
              className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy === 'shipping' ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              保存全部运费规则
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
