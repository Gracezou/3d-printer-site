'use client';

import {
  CircleAlert,
  Cpu,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

interface ProductOption {
  id: string;
  name: string;
}

interface DeviceModel {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  aliases: string[];
  releaseYear: number | null;
  isDiscontinued: boolean;
  isMolded: boolean;
  dimensions: {
    widthMm?: number;
    heightMm?: number;
    thicknessMm?: number;
    weightGrams?: number;
  };
  compatGroup: string | null;
  notes: string | null;
  sortOrder: number;
  isVisible: boolean;
  productIds: string[];
  requestCount: number;
}

interface DeviceBrand {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  sortOrder: number;
  isVisible: boolean;
  models: DeviceModel[];
}

interface DeviceResult {
  brands: DeviceBrand[];
  products: ProductOption[];
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

type ApiRequest = <T>(url: string, init?: RequestInit) => Promise<T>;

const inputClass =
  'h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

function splitAliases(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[,，\n]/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function optionalNumber(value: string): number | undefined {
  return value.trim() ? Number(value) : undefined;
}

function Modal({
  title,
  description,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        className="relative max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        <div className="flex items-start justify-between border-b border-black/6 px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
            {description ? (
              <p className="mt-1 text-sm text-neutral-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="关闭"
            onClick={onClose}
            className="rounded-xl bg-neutral-100 p-2 text-neutral-500 hover:bg-neutral-200"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-88px)] overflow-y-auto">
          {children}
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-700">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      ) : null}
    </label>
  );
}

function FormActions({
  submitting,
  onClose,
}: {
  submitting: boolean;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-end gap-3 border-t border-black/6 bg-neutral-50 px-5 py-4 sm:px-7">
      <button
        type="button"
        onClick={onClose}
        className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
      >
        取消
      </button>
      <button
        disabled={submitting}
        className="flex h-10 items-center gap-2 rounded-xl bg-neutral-950 px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
        保存
      </button>
    </div>
  );
}

export function DevicesManager() {
  const router = useRouter();
  const [result, setResult] = useState<DeviceResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [brandEditor, setBrandEditor] = useState<DeviceBrand | 'new' | null>(
    null,
  );
  const [modelEditor, setModelEditor] = useState<{
    brandId: string;
    model: DeviceModel | null;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'brand' | 'model';
    id: string;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const apiRequest = useCallback(
    async <T,>(url: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(url, {
        ...init,
        headers: init?.body
          ? { 'Content-Type': 'application/json', ...init.headers }
          : init?.headers,
      });
      const payload = (await response.json()) as ApiEnvelope<T>;
      if (response.status === 401) {
        router.replace('/admin/login');
        throw new Error('登录已失效，请重新登录');
      }
      if (!response.ok || payload.data === null) {
        throw new Error(payload.message || '请求失败');
      }
      return payload.data;
    },
    [router],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await apiRequest<DeviceResult>('/api/admin/devices'));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '机型数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const totalModels = useMemo(
    () =>
      result?.brands.reduce(
        (total, brand) => total + brand.models.length,
        0,
      ) ?? 0,
    [result],
  );

  async function remove(): Promise<void> {
    if (!deleteTarget) return;
    setBusy(true);
    setError('');
    try {
      const path = deleteTarget.kind === 'brand' ? 'brands' : 'models';
      await apiRequest(`/api/admin/devices/${path}/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      setNotice(deleteTarget.kind === 'brand' ? '品牌已删除' : '机型已删除');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '删除失败');
      setDeleteTarget(null);
    } finally {
      setBusy(false);
    }
  }

  const requestTotal =
    result?.brands.reduce(
      (sum, brand) =>
        sum +
        brand.models.reduce((count, model) => count + model.requestCount, 0),
      0,
    ) ?? 0;

  return (
    <div className="px-4 py-8 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-400">
              Device catalog
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
              机型管理
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              维护电子阅读器品牌、型号、别名和已开模商品关联。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium disabled:opacity-50"
            >
              <RefreshCw
                className={`size-4 ${loading ? 'animate-spin' : ''}`}
              />
              刷新
            </button>
            <button
              type="button"
              onClick={() => setBrandEditor('new')}
              className="flex h-11 items-center gap-2 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white"
            >
              <Plus className="size-4" />
              新增品牌
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            ['品牌', result?.brands.length ?? 0],
            ['机型', totalModels],
            ['意向登记', requestTotal],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-2xl border border-black/6 bg-white p-5 shadow-sm"
            >
              <p className="text-sm text-neutral-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold text-neutral-950">
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          <strong>命名规范：</strong>
          第三方品牌和型号仅用于兼容性描述；商品名称使用“适用于 品牌
          型号”，不得使用品牌 Logo，也不得暗示官方出品或授权。
        </div>

        {notice ? (
          <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {loading && !result ? (
          <div className="mt-6 flex h-48 items-center justify-center rounded-2xl border border-black/6 bg-white text-neutral-400">
            <LoaderCircle className="mr-2 size-5 animate-spin" />
            正在加载机型库
          </div>
        ) : result?.brands.length ? (
          <div className="mt-6 space-y-5">
            {result.brands.map((brand) => (
              <section
                key={brand.id}
                className={`overflow-hidden rounded-2xl border border-black/6 bg-white shadow-sm ${
                  brand.isVisible ? '' : 'opacity-60'
                }`}
              >
                <div className="flex flex-col gap-4 border-b border-black/6 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold">{brand.name}</h2>
                      <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                        {brand.models.length} 个机型
                      </span>
                      {!brand.isVisible ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          已隐藏
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-neutral-400">
                      /{brand.slug}
                      {brand.aliases.length
                        ? ` · 别名：${brand.aliases.join('、')}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setModelEditor({ brandId: brand.id, model: null })
                      }
                      className="flex h-9 items-center gap-1.5 rounded-lg bg-neutral-950 px-3 text-xs font-semibold text-white"
                    >
                      <Plus className="size-3.5" />
                      新增机型
                    </button>
                    <button
                      type="button"
                      title="编辑品牌"
                      onClick={() => setBrandEditor(brand)}
                      className="rounded-lg border border-black/8 p-2 text-neutral-500 hover:bg-neutral-50"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="删除品牌"
                      onClick={() =>
                        setDeleteTarget({
                          kind: 'brand',
                          id: brand.id,
                          name: brand.name,
                        })
                      }
                      className="rounded-lg border border-black/8 p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
                {brand.models.length ? (
                  <div className="divide-y divide-black/5">
                    {brand.models.map((model) => (
                      <div
                        key={model.id}
                        className="grid gap-3 px-5 py-4 md:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_auto] md:items-center"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime-100 text-lime-800">
                            <Cpu className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{model.name}</p>
                            <p className="mt-0.5 truncate font-mono text-xs text-neutral-400">
                              /{brand.slug}/{model.slug}
                            </p>
                          </div>
                        </div>
                        <div className="text-sm text-neutral-500">
                          <p>
                            {model.releaseYear ?? '年份未录入'}
                            {model.isDiscontinued ? ' · 已停产' : ''}
                          </p>
                          <p className="mt-1 text-xs">
                            {model.aliases.length
                              ? model.aliases.join('、')
                              : '暂无别名'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <span
                            className={`rounded-full px-2 py-1 ${
                              model.isMolded
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-neutral-100 text-neutral-500'
                            }`}
                          >
                            {model.isMolded ? '已开模' : '未开模'}
                          </span>
                          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">
                            {model.productIds.length} 个商品
                          </span>
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">
                            {model.requestCount} 人登记
                          </span>
                          {!model.isVisible ? (
                            <span className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-500">
                              已隐藏
                            </span>
                          ) : null}
                        </div>
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            title="编辑机型"
                            onClick={() =>
                              setModelEditor({ brandId: brand.id, model })
                            }
                            className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            title="删除机型"
                            onClick={() =>
                              setDeleteTarget({
                                kind: 'model',
                                id: model.id,
                                name: `${brand.name} ${model.name}`,
                              })
                            }
                            className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-5 py-8 text-center text-sm text-neutral-400">
                    这个品牌还没有录入机型
                  </p>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-black/12 bg-white px-6 py-14 text-center">
            <Cpu className="mx-auto size-8 text-neutral-300" />
            <h2 className="mt-4 font-semibold">尚未录入设备品牌</h2>
            <p className="mt-1 text-sm text-neutral-500">
              先新增品牌，再为品牌添加型号。
            </p>
          </div>
        )}
      </div>

      {brandEditor ? (
        <BrandEditor
          brand={brandEditor === 'new' ? null : brandEditor}
          apiRequest={apiRequest}
          onClose={() => setBrandEditor(null)}
          onSaved={(message) => {
            setBrandEditor(null);
            setNotice(message);
            void load();
          }}
        />
      ) : null}
      {modelEditor && result ? (
        <ModelEditor
          state={modelEditor}
          products={result.products}
          apiRequest={apiRequest}
          onClose={() => setModelEditor(null)}
          onSaved={(message) => {
            setModelEditor(null);
            setNotice(message);
            void load();
          }}
        />
      ) : null}
      {deleteTarget ? (
        <Modal title="确认删除" onClose={() => setDeleteTarget(null)}>
          <div className="px-5 py-6 sm:px-7">
            <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-sm leading-6 text-red-800">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <p>
                确定删除 <strong>{deleteTarget.name}</strong>
                ？如果仍有关联数据，系统会阻止删除。
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-black/6 bg-neutral-50 px-5 py-4 sm:px-7">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove()}
              className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
              确认删除
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function BrandEditor({
  brand,
  apiRequest,
  onClose,
  onSaved,
}: {
  brand: DeviceBrand | null;
  apiRequest: ApiRequest;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState({
    name: brand?.name ?? '',
    slug: brand?.slug ?? '',
    aliases: brand?.aliases.join('，') ?? '',
    sortOrder: String(brand?.sortOrder ?? 0),
    isVisible: brand?.isVisible ?? true,
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(
        brand
          ? `/api/admin/devices/brands/${brand.id}`
          : '/api/admin/devices/brands',
        {
          method: brand ? 'PATCH' : 'POST',
          body: JSON.stringify({
            name: form.name,
            slug: form.slug,
            aliases: splitAliases(form.aliases),
            sortOrder: Number(form.sortOrder),
            isVisible: form.isVisible,
          }),
        },
      );
      onSaved(brand ? '品牌已更新' : '品牌已创建');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={brand ? '编辑品牌' : '新增品牌'}
      description="品牌别名会参与前台搜索。"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-5 px-5 py-6 sm:px-7">
          <Field label="品牌名称">
            <input
              required
              maxLength={50}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className={inputClass}
              placeholder="文石 / BOOX"
            />
          </Field>
          <Field label="Slug" hint="仅小写字母、数字和连字符。">
            <input
              required
              maxLength={50}
              value={form.slug}
              onChange={(event) =>
                setForm({ ...form, slug: event.target.value.toLowerCase() })
              }
              className={inputClass}
              placeholder="boox"
            />
          </Field>
          <Field label="品牌别名" hint="使用逗号分隔，例如：文石，BOOX。">
            <input
              value={form.aliases}
              onChange={(event) =>
                setForm({ ...form, aliases: event.target.value })
              }
              className={inputClass}
              placeholder="文石，BOOX"
            />
          </Field>
          <Field label="排序值">
            <input
              required
              type="number"
              min={-999999}
              max={999999}
              value={form.sortOrder}
              onChange={(event) =>
                setForm({ ...form, sortOrder: event.target.value })
              }
              className={inputClass}
            />
          </Field>
          <label className="flex items-center justify-between rounded-2xl border border-black/8 p-4">
            <span>
              <span className="block text-sm font-medium">前台显示</span>
              <span className="mt-1 block text-xs text-neutral-400">
                关闭后品牌及其机型不会出现在前台
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(event) =>
                setForm({ ...form, isVisible: event.target.checked })
              }
              className="size-5 accent-neutral-900"
            />
          </label>
          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <FormActions submitting={submitting} onClose={onClose} />
      </form>
    </Modal>
  );
}

function ModelEditor({
  state,
  products,
  apiRequest,
  onClose,
  onSaved,
}: {
  state: { brandId: string; model: DeviceModel | null };
  products: ProductOption[];
  apiRequest: ApiRequest;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const model = state.model;
  const dimensions = model?.dimensions ?? {};
  const [form, setForm] = useState({
    name: model?.name ?? '',
    slug: model?.slug ?? '',
    aliases: model?.aliases.join('，') ?? '',
    releaseYear: model?.releaseYear ? String(model.releaseYear) : '',
    isDiscontinued: model?.isDiscontinued ?? false,
    isMolded: model?.isMolded ?? false,
    widthMm: dimensions.widthMm ? String(dimensions.widthMm) : '',
    heightMm: dimensions.heightMm ? String(dimensions.heightMm) : '',
    thicknessMm: dimensions.thicknessMm
      ? String(dimensions.thicknessMm)
      : '',
    weightGrams: dimensions.weightGrams ? String(dimensions.weightGrams) : '',
    compatGroup: model?.compatGroup ?? '',
    notes: model?.notes ?? '',
    sortOrder: String(model?.sortOrder ?? 0),
    isVisible: model?.isVisible ?? true,
    productIds: model?.productIds ?? [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function toggleProduct(id: string) {
    setForm((current) => ({
      ...current,
      productIds: current.productIds.includes(id)
        ? current.productIds.filter((item) => item !== id)
        : [...current.productIds, id],
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(
        model
          ? `/api/admin/devices/models/${model.id}`
          : '/api/admin/devices/models',
        {
          method: model ? 'PATCH' : 'POST',
          body: JSON.stringify({
            brandId: state.brandId,
            name: form.name,
            slug: form.slug,
            aliases: splitAliases(form.aliases),
            releaseYear: form.releaseYear ? Number(form.releaseYear) : null,
            isDiscontinued: form.isDiscontinued,
            isMolded: form.isMolded,
            dimensions: {
              widthMm: optionalNumber(form.widthMm),
              heightMm: optionalNumber(form.heightMm),
              thicknessMm: optionalNumber(form.thicknessMm),
              weightGrams: optionalNumber(form.weightGrams),
            },
            compatGroup: form.compatGroup || null,
            notes: form.notes || null,
            sortOrder: Number(form.sortOrder),
            isVisible: form.isVisible,
            productIds: form.productIds,
          }),
        },
      );
      onSaved(model ? '机型已更新' : '机型已创建');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  const dimensionFields = [
    ['widthMm', '宽度（mm）'],
    ['heightMm', '高度（mm）'],
    ['thicknessMm', '厚度（mm）'],
    ['weightGrams', '重量（g）'],
  ] as const;

  return (
    <Modal
      title={model ? '编辑机型' : '新增机型'}
      description="型号别名、尺寸和兼容组会用于搜索与适配说明。"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          <Field label="型号名称">
            <input
              required
              maxLength={80}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              className={inputClass}
              placeholder="Leaf 3C"
            />
          </Field>
          <Field label="Slug" hint="仅小写字母、数字和连字符。">
            <input
              required
              maxLength={80}
              value={form.slug}
              onChange={(event) =>
                setForm({ ...form, slug: event.target.value.toLowerCase() })
              }
              className={inputClass}
              placeholder="leaf-3c"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="型号别名" hint="逗号分隔，别名会参与搜索。">
              <input
                value={form.aliases}
                onChange={(event) =>
                  setForm({ ...form, aliases: event.target.value })
                }
                className={inputClass}
                placeholder="Leaf3C，Leaf 3 C"
              />
            </Field>
          </div>
          <Field label="发布年份">
            <input
              type="number"
              min={2000}
              max={2100}
              value={form.releaseYear}
              onChange={(event) =>
                setForm({ ...form, releaseYear: event.target.value })
              }
              className={inputClass}
              placeholder="2024"
            />
          </Field>
          <Field
            label="兼容组"
            hint="外形完全一致、可共用壳的机型使用相同值。"
          >
            <input
              maxLength={50}
              value={form.compatGroup}
              onChange={(event) =>
                setForm({ ...form, compatGroup: event.target.value })
              }
              className={inputClass}
              placeholder="boox-leaf-3-shell"
            />
          </Field>
          {dimensionFields.map(([key, label]) => (
            <Field key={key} label={label}>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form[key]}
                onChange={(event) =>
                  setForm({ ...form, [key]: event.target.value })
                }
                className={inputClass}
              />
            </Field>
          ))}
          <Field label="排序值">
            <input
              required
              type="number"
              min={-999999}
              max={999999}
              value={form.sortOrder}
              onChange={(event) =>
                setForm({ ...form, sortOrder: event.target.value })
              }
              className={inputClass}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="适配说明">
              <textarea
                maxLength={4000}
                rows={4}
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                className={`${inputClass} h-auto py-3`}
                placeholder="接口、按键和版本差异说明"
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <p className="mb-2 text-sm font-medium text-neutral-700">
              关联保护壳商品
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-black/8 p-2">
              {products.length ? (
                products.map((product) => (
                  <label
                    key={product.id}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-neutral-50"
                  >
                    <input
                      type="checkbox"
                      checked={form.productIds.includes(product.id)}
                      onChange={() => toggleProduct(product.id)}
                      className="size-4 accent-neutral-900"
                    />
                    <span>{product.name}</span>
                  </label>
                ))
              ) : (
                <p className="p-3 text-sm text-neutral-400">暂无可关联商品</p>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-3">
            {(
              [
                ['isMolded', '已开模'],
                ['isDiscontinued', '已停产'],
                ['isVisible', '前台显示'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-xl border border-black/8 p-3 text-sm font-medium"
              >
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={form[key]}
                  onChange={(event) =>
                    setForm({ ...form, [key]: event.target.checked })
                  }
                  className="size-5 accent-neutral-900"
                />
              </label>
            ))}
          </div>
          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          ) : null}
        </div>
        <FormActions submitting={submitting} onClose={onClose} />
      </form>
    </Modal>
  );
}
