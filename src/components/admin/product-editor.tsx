'use client';

import {
  ArrowLeft,
  Box,
  Braces,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Eye,
  EyeOff,
  FileText,
  ImageIcon,
  Layers3,
  LoaderCircle,
  Plus,
  Save,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { notifyAdminUnauthorized } from '@/lib/admin-session-client';
import { zhCN } from '@/messages/zh-CN';

import {
  buildAttributeCombinations,
  buildVariantName,
  type AttributeDimension,
} from '@/lib/product-variants';

interface CategoryNode {
  id: string;
  name: string;
  children: CategoryNode[];
}

interface MaterialOption {
  id: string;
  code: string;
  name: string;
  materialType: string;
  colorName: string | null;
  colorHex: string | null;
  stockGrams: string;
  reservedGrams: string;
  safetyGrams: string;
  availableGrams: string;
  isActive: boolean;
}

interface BomItem {
  materialId: string;
  grams: string;
}

interface VariantDraft {
  id: string | null;
  skuCode: string;
  name: string;
  attributes: Record<string, string>;
  price: string;
  comparePrice: string;
  weightGrams: string;
  printHours: string;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
  availableQty: number | null;
  bom: BomItem[];
}

interface ProductDetail {
  id: string;
  categoryId: string | null;
  name: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  mainImageUrl: string | null;
  gallery: string[];
  modelPreviewUrl: string | null;
  specs: Record<string, string>;
  status: 'draft' | 'on_sale' | 'off_shelf';
  isFeatured: boolean;
  sortOrder: number;
  minPrice: string | null;
  variants: Array<
    Omit<VariantDraft, 'comparePrice' | 'printHours' | 'imageUrl' | 'bom'> & {
      comparePrice: string | null;
      printHours: string | null;
      imageUrl: string | null;
      bom: Array<{ materialId: string; grams: string }>;
    }
  >;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

interface ProductEditorProps {
  productId: string | null;
  canPublish: boolean;
}

interface ProductForm {
  categoryId: string;
  name: string;
  slug: string;
  subtitle: string;
  description: string;
  mainImageUrl: string;
  gallery: string[];
  modelPreviewUrl: string;
  specs: Array<{ key: string; value: string }>;
  isFeatured: boolean;
  sortOrder: string;
}

const inputClass =
  'h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers:
      typeof init?.body === 'string'
        ? { 'Content-Type': 'application/json', ...init.headers }
        : init?.headers,
  });
  const result = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || result.data === null) {
    if (response.status === 401) notifyAdminUnauthorized();
    throw new Error(result.message || '请求失败');
  }
  return result.data;
}

function AssetUploadButton({
  type,
  label,
  onUploaded,
  onError,
}: {
  type: 'image' | 'model';
  label: string;
  onUploaded: (url: string) => void;
  onError: (message: string) => void;
}) {
  const [uploading, setUploading] = useState(false);

  async function selectFile(file: File | undefined): Promise<void> {
    if (!file) return;
    setUploading(true);
    onError('');
    try {
      const body = new FormData();
      body.set('type', type);
      body.set('file', file);
      const result = await apiRequest<{ url: string }>('/api/admin/upload', {
        method: 'POST',
        body,
      });
      onUploaded(result.url);
    } catch (caught: unknown) {
      onError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-neutral-50 px-4 text-sm font-medium transition hover:bg-neutral-100">
      {uploading ? (
        <LoaderCircle className="size-4 animate-spin" />
      ) : (
        <UploadCloud className="size-4" />
      )}
      {uploading ? '上传中…' : label}
      <input
        type="file"
        disabled={uploading}
        accept={
          type === 'image'
            ? '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'
            : '.glb,model/gltf-binary'
        }
        className="hidden"
        onChange={(event) => {
          void selectFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </label>
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
    <div className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-700">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-xs text-neutral-400">{hint}</span>
      ) : null}
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
      <div className="flex items-center justify-between gap-4 border-b border-black/6 px-5 py-5 sm:px-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-neutral-100 text-neutral-600">
            {icon}
          </span>
          <div>
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-1 text-xs text-neutral-400">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MarkdownPreview({ value }: { value: string }) {
  if (!value.trim()) {
    return <p className="text-sm text-neutral-400">暂无预览内容</p>;
  }
  return (
    <div className="space-y-2 text-sm leading-7 text-neutral-700">
      {value.split('\n').map((line, index) => {
        if (line.startsWith('### ')) {
          return (
            <h4 key={index} className="pt-2 text-base font-semibold">
              {line.slice(4)}
            </h4>
          );
        }
        if (line.startsWith('## ')) {
          return (
            <h3 key={index} className="pt-2 text-lg font-semibold">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('# ')) {
          return (
            <h2 key={index} className="pt-2 text-xl font-semibold">
              {line.slice(2)}
            </h2>
          );
        }
        if (line.startsWith('- ')) {
          return (
            <p key={index} className="pl-4 before:mr-2 before:content-['•']">
              {line.slice(2)}
            </p>
          );
        }
        return line ? (
          <p key={index}>{line}</p>
        ) : (
          <div key={index} className="h-2" />
        );
      })}
    </div>
  );
}

function GeneratorModal({
  productSlug,
  existingVariants,
  onClose,
  onGenerate,
}: {
  productSlug: string;
  existingVariants: VariantDraft[];
  onClose: () => void;
  onGenerate: (variants: VariantDraft[]) => void;
}) {
  const [dimensions, setDimensions] = useState<
    Array<{ name: string; valuesText: string }>
  >([
    { name: '尺寸', valuesText: '小号, 大号' },
    { name: '颜色', valuesText: '白色, 黑色' },
  ]);
  const parsed: AttributeDimension[] = dimensions.map((dimension) => ({
    name: dimension.name,
    values: dimension.valuesText.split(/[,，\n]/),
  }));
  const combinations = buildAttributeCombinations(parsed);

  function generate(): void {
    const existingSignatures = new Set(
      existingVariants.map((variant) => JSON.stringify(variant.attributes)),
    );
    const stamp = Date.now().toString(36).toUpperCase().slice(-5);
    const prefix =
      productSlug
        .replace(/[^a-zA-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .toUpperCase()
        .slice(0, 35) || 'SKU';
    const generated = combinations
      .filter(
        (attributes) => !existingSignatures.has(JSON.stringify(attributes)),
      )
      .map<VariantDraft>((attributes, index) => ({
        id: null,
        skuCode: `${prefix}-${stamp}-${index + 1}`,
        name: buildVariantName(attributes),
        attributes,
        price: '0.00',
        comparePrice: '',
        weightGrams: '0.00',
        printHours: '',
        imageUrl: '',
        isActive: false,
        sortOrder: existingVariants.length + index,
        availableQty: 0,
        bom: [],
      }));
    onGenerate(generated);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section className="relative max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-black/6 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold">批量生成变体</h2>
            <p className="mt-1 text-sm text-neutral-500">
              填写属性维度与选项，系统按笛卡尔积生成组合。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-neutral-100 p-2 text-neutral-500"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="space-y-4 px-6 py-6">
          {dimensions.map((dimension, index) => (
            <div
              key={index}
              className="grid gap-3 rounded-2xl border border-black/6 p-4 sm:grid-cols-[150px_1fr_auto]"
            >
              <input
                value={dimension.name}
                onChange={(event) =>
                  setDimensions((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, name: event.target.value }
                        : item,
                    ),
                  )
                }
                className={inputClass}
                placeholder="属性名"
              />
              <input
                value={dimension.valuesText}
                onChange={(event) =>
                  setDimensions((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, valuesText: event.target.value }
                        : item,
                    ),
                  )
                }
                className={inputClass}
                placeholder="选项，以逗号分隔"
              />
              <button
                type="button"
                disabled={dimensions.length <= 1}
                onClick={() =>
                  setDimensions((current) =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                className="grid size-11 place-items-center rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setDimensions((current) => [
                ...current,
                { name: '', valuesText: '' },
              ])
            }
            className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-black/15 px-4 text-sm text-neutral-500"
          >
            <Plus className="size-4" />
            添加属性维度
          </button>
          <div className="rounded-2xl bg-lime-50 p-4 text-sm text-lime-900">
            将生成 <strong>{combinations.length}</strong>{' '}
            个组合；已存在的相同属性组合会跳过。新变体默认停用，请配置价格和 BOM
            后再启用。
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-black/6 bg-neutral-50 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
          >
            取消
          </button>
          <button
            type="button"
            disabled={combinations.length === 0}
            onClick={generate}
            className="flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            <Sparkles className="size-4" />
            生成组合
          </button>
        </div>
      </section>
    </div>
  );
}

function newVariant(index: number): VariantDraft {
  return {
    id: null,
    skuCode: `SKU-${Date.now().toString(36).toUpperCase()}-${index + 1}`,
    name: '新变体',
    attributes: {},
    price: '0.00',
    comparePrice: '',
    weightGrams: '0.00',
    printHours: '',
    imageUrl: '',
    isActive: false,
    sortOrder: index,
    availableQty: 0,
    bom: [],
  };
}

export function ProductEditor({ productId, canPublish }: ProductEditorProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [savingBase, setSavingBase] = useState(false);
  const [savingVariants, setSavingVariants] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [form, setForm] = useState<ProductForm>({
    categoryId: '',
    name: '',
    slug: '',
    subtitle: '',
    description: '',
    mainImageUrl: '',
    gallery: [],
    modelPreviewUrl: '',
    specs: [],
    isFeatured: false,
    sortOrder: '0',
  });

  const applyProduct = useCallback(
    (detail: ProductDetail, preserveVariantDrafts = false) => {
      setProduct(detail);
      setForm({
        categoryId: detail.categoryId ?? '',
        name: detail.name,
        slug: detail.slug,
        subtitle: detail.subtitle ?? '',
        description: detail.description ?? '',
        mainImageUrl: detail.mainImageUrl ?? '',
        gallery: detail.gallery,
        modelPreviewUrl: detail.modelPreviewUrl ?? '',
        specs: Object.entries(detail.specs).map(([key, value]) => ({
          key,
          value,
        })),
        isFeatured: detail.isFeatured,
        sortOrder: String(detail.sortOrder),
      });
      if (!preserveVariantDrafts) {
        setVariants(
          detail.variants.map((variant) => ({
            ...variant,
            comparePrice: variant.comparePrice ?? '',
            printHours: variant.printHours ?? '',
            imageUrl: variant.imageUrl ?? '',
            bom: variant.bom.map((item) => ({
              materialId: item.materialId,
              grams: item.grams,
            })),
          })),
        );
      }
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const requests: [
        Promise<{ list: CategoryNode[] }>,
        Promise<{ list: MaterialOption[] }>,
        Promise<ProductDetail> | null,
      ] = [
        apiRequest('/api/admin/categories'),
        apiRequest(
          '/api/admin/materials?page=1&pageSize=100&lowStockOnly=false',
        ),
        productId ? apiRequest(`/api/admin/products/${productId}`) : null,
      ];
      const [categoryResult, materialResult, detail] =
        await Promise.all(requests);
      setCategories(categoryResult.list);
      setMaterials(materialResult.list);
      if (detail) applyProduct(detail);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '页面加载失败');
    } finally {
      setLoading(false);
    }
  }, [applyProduct, productId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function patchForm<K extends keyof ProductForm>(
    key: K,
    value: ProductForm[K],
  ): void {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function patchVariant(index: number, patch: Partial<VariantDraft>): void {
    setVariants((current) =>
      current.map((variant, itemIndex) =>
        itemIndex === index ? { ...variant, ...patch } : variant,
      ),
    );
  }

  async function saveBase(event?: FormEvent<HTMLFormElement>): Promise<void> {
    event?.preventDefault();
    setSavingBase(true);
    setError('');
    try {
      const specs = Object.fromEntries(
        form.specs
          .filter((item) => item.key.trim())
          .map((item) => [item.key.trim(), item.value]),
      );
      const payload = {
        categoryId: form.categoryId || null,
        name: form.name,
        slug: form.slug,
        subtitle: form.subtitle || null,
        description: form.description || null,
        mainImageUrl: form.mainImageUrl || null,
        gallery: form.gallery.filter(Boolean),
        modelPreviewUrl: form.modelPreviewUrl || null,
        specs,
        isFeatured: form.isFeatured,
        sortOrder: Number(form.sortOrder),
      };
      if (productId) {
        await apiRequest(`/api/admin/products/${productId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        const detail = await apiRequest<ProductDetail>(
          `/api/admin/products/${productId}`,
        );
        applyProduct(detail, true);
        setNotice('商品基础信息已保存');
      } else {
        const created = await apiRequest<{ id: string }>(
          '/api/admin/products',
          { method: 'POST', body: JSON.stringify(payload) },
        );
        router.replace(`/admin/products/${created.id}`);
        router.refresh();
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSavingBase(false);
    }
  }

  async function saveVariants(): Promise<void> {
    if (!productId) return;
    setSavingVariants(true);
    setError('');
    try {
      const detail = await apiRequest<ProductDetail>(
        `/api/admin/products/${productId}/variants`,
        {
          method: 'PUT',
          body: JSON.stringify({
            variants: variants.map((variant, index) => ({
              id: variant.id,
              skuCode: variant.skuCode,
              name: variant.name,
              attributes: variant.attributes,
              price: variant.price,
              comparePrice: variant.comparePrice || null,
              weightGrams: variant.weightGrams,
              printHours: variant.printHours || null,
              imageUrl: variant.imageUrl || null,
              isActive: variant.isActive,
              sortOrder: index,
              bom: variant.bom,
            })),
          }),
        },
      );
      applyProduct(detail);
      setNotice('变体与 BOM 已保存，可售数量已刷新');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '变体保存失败');
    } finally {
      setSavingVariants(false);
    }
  }

  async function changeStatus(): Promise<void> {
    if (!productId || !product) return;
    setPublishing(true);
    setError('');
    const status = product.status === 'on_sale' ? 'off_shelf' : 'on_sale';
    try {
      await apiRequest(`/api/admin/products/${productId}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      const detail = await apiRequest<ProductDetail>(
        `/api/admin/products/${productId}`,
      );
      applyProduct(detail, true);
      setNotice(status === 'on_sale' ? '商品已上架' : '商品已下架');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setPublishing(false);
    }
  }

  if (loading)
    return (
      <div className="grid min-h-screen place-items-center text-neutral-400">
        <LoaderCircle className="size-7 animate-spin" />
      </div>
    );

  const flatCategories = categories.flatMap((root) => [root, ...root.children]);
  return (
    <div className="mx-auto max-w-[1380px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] flex items-center gap-2 rounded-2xl bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          <Check className="size-4 text-lime-300" />
          {notice}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-neutral-900"
          >
            <ArrowLeft className="size-4" />
            返回商品列表
          </Link>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight">
            {productId ? form.name || '编辑商品' : '新增商品'}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            {productId
              ? `状态：${product?.status === 'on_sale' ? '在售' : product?.status === 'off_shelf' ? '已下架' : '草稿'} · 最低价 ${product?.minPrice ? `¥${product.minPrice}` : '未设置'}`
              : '先保存基础信息，再配置商品变体与 BOM。'}
          </p>
        </div>
        <div className="flex gap-3">
          {productId && canPublish ? (
            <button
              type="button"
              disabled={publishing}
              onClick={() => void changeStatus()}
              className={`flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-semibold ${product?.status === 'on_sale' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
            >
              {publishing ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : product?.status === 'on_sale' ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
              {product?.status === 'on_sale' ? '下架商品' : '上架商品'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={savingBase}
            onClick={() => void saveBase()}
            className="flex h-11 items-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {savingBase ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {productId ? '保存基础信息' : '创建商品'}
          </button>
        </div>
      </div>
      {error ? (
        <div className="mt-5 flex items-start gap-2 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {error}
        </div>
      ) : null}

      <form
        onSubmit={(event) => void saveBase(event)}
        className="mt-7 space-y-5"
      >
        <Section
          icon={<Box className="size-5" />}
          title="基础信息"
          description="商品名称、分类、展示地址与推荐状态"
        >
          <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7 lg:grid-cols-3">
            <Field label="商品名称" hint={zhCN.naming.adminHint}>
              <input
                required
                maxLength={120}
                value={form.name}
                onChange={(event) => patchForm('name', event.target.value)}
                className={inputClass}
                placeholder={zhCN.naming.compatibilityExample}
              />
            </Field>
            <Field
              label="Slug"
              hint="前台地址使用，仅支持小写字母、数字和连字符。"
            >
              <input
                required
                maxLength={150}
                value={form.slug}
                onChange={(event) =>
                  patchForm('slug', event.target.value.toLowerCase())
                }
                className={inputClass}
                placeholder="totoro-figure"
              />
            </Field>
            <Field label="商品分类">
              <select
                value={form.categoryId}
                onChange={(event) =>
                  patchForm('categoryId', event.target.value)
                }
                className={inputClass}
              >
                <option value="">未分类</option>
                {flatCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="副标题">
                <input
                  maxLength={200}
                  value={form.subtitle}
                  onChange={(event) =>
                    patchForm('subtitle', event.target.value)
                  }
                  className={inputClass}
                  placeholder="按需打印 · 多色可选"
                />
              </Field>
            </div>
            <Field label="排序值" hint="数值越大，在后台默认排序中越靠前。">
              <input
                type="number"
                value={form.sortOrder}
                onChange={(event) => patchForm('sortOrder', event.target.value)}
                className={inputClass}
              />
            </Field>
            <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-black/8 p-4 sm:col-span-2 lg:col-span-1">
              <span>
                <span className="block text-sm font-medium">首页推荐</span>
                <span className="mt-1 block text-xs text-neutral-400">
                  在售后可进入推荐商品区
                </span>
              </span>
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(event) =>
                  patchForm('isFeatured', event.target.checked)
                }
                className="size-5 accent-neutral-900"
              />
            </label>
          </div>
        </Section>

        <Section
          icon={<FileText className="size-5" />}
          title="商品描述"
          description="使用 Markdown 编写商品详情"
          action={
            <div className="flex rounded-lg bg-neutral-100 p-1 text-xs">
              <button
                type="button"
                onClick={() => setPreviewMarkdown(false)}
                className={`rounded-md px-3 py-1.5 ${!previewMarkdown ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'}`}
              >
                编辑
              </button>
              <button
                type="button"
                onClick={() => setPreviewMarkdown(true)}
                className={`rounded-md px-3 py-1.5 ${previewMarkdown ? 'bg-white font-medium shadow-sm' : 'text-neutral-500'}`}
              >
                预览
              </button>
            </div>
          }
        >
          <div className="px-5 py-6 sm:px-7">
            {previewMarkdown ? (
              <div className="min-h-72 rounded-2xl border border-black/6 bg-neutral-50 p-5">
                <MarkdownPreview value={form.description} />
              </div>
            ) : (
              <textarea
                value={form.description}
                onChange={(event) =>
                  patchForm('description', event.target.value)
                }
                className="min-h-72 w-full rounded-2xl border border-black/10 p-4 font-mono text-sm leading-7 outline-none focus:border-neutral-500"
                placeholder="# 商品介绍&#10;&#10;- 特点一&#10;- 特点二"
              />
            )}
          </div>
        </Section>

        <Section
          icon={<ImageIcon className="size-5" />}
          title="图片与模型"
          description="图片支持 JPG、PNG、WebP（≤5MB），模型支持 GLB（≤20MB）"
        >
          <div className="space-y-5 px-5 py-6 sm:px-7">
            <Field label="主图 URL">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.mainImageUrl}
                  onChange={(event) =>
                    patchForm('mainImageUrl', event.target.value)
                  }
                  className={inputClass}
                  placeholder="https://..."
                />
                <AssetUploadButton
                  type="image"
                  label="上传主图"
                  onUploaded={(url) => {
                    patchForm('mainImageUrl', url);
                    setNotice('主图上传成功');
                  }}
                  onError={setError}
                />
              </div>
            </Field>
            <Field label="图集 URL">
              <div className="space-y-2">
                {form.gallery.map((url, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="url"
                      value={url}
                      onChange={(event) =>
                        patchForm(
                          'gallery',
                          form.gallery.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item,
                          ),
                        )
                      }
                      className={inputClass}
                      placeholder="https://..."
                    />
                    <button
                      type="button"
                      onClick={() =>
                        patchForm(
                          'gallery',
                          form.gallery.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        )
                      }
                      className="grid size-11 shrink-0 place-items-center rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => patchForm('gallery', [...form.gallery, ''])}
                  className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-black/15 px-4 text-sm text-neutral-500"
                >
                  <Plus className="size-4" />
                  添加图片地址
                </button>
                <AssetUploadButton
                  type="image"
                  label="上传并加入图集"
                  onUploaded={(url) => {
                    patchForm('gallery', [...form.gallery, url]);
                    setNotice('图集图片上传成功');
                  }}
                  onError={setError}
                />
              </div>
            </Field>
            <Field label="GLB 模型预览 URL">
              <div className="flex gap-2">
                <input
                  type="url"
                  value={form.modelPreviewUrl}
                  onChange={(event) =>
                    patchForm('modelPreviewUrl', event.target.value)
                  }
                  className={inputClass}
                  placeholder="https://.../model.glb"
                />
                <AssetUploadButton
                  type="model"
                  label="上传 GLB"
                  onUploaded={(url) => {
                    patchForm('modelPreviewUrl', url);
                    setNotice('GLB 模型上传成功');
                  }}
                  onError={setError}
                />
              </div>
            </Field>
          </div>
        </Section>

        <Section
          icon={<Braces className="size-5" />}
          title="规格参数"
          description="以前台参数表形式展示的键值对"
        >
          <div className="space-y-3 px-5 py-6 sm:px-7">
            {form.specs.map((spec, index) => (
              <div
                key={index}
                className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]"
              >
                <input
                  value={spec.key}
                  onChange={(event) =>
                    patchForm(
                      'specs',
                      form.specs.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, key: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className={inputClass}
                  placeholder="参数名，如尺寸"
                />
                <input
                  value={spec.value}
                  onChange={(event) =>
                    patchForm(
                      'specs',
                      form.specs.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, value: event.target.value }
                          : item,
                      ),
                    )
                  }
                  className={inputClass}
                  placeholder="参数值，如 10 × 8 × 12 cm"
                />
                <button
                  type="button"
                  onClick={() =>
                    patchForm(
                      'specs',
                      form.specs.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  className="grid size-11 place-items-center rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() =>
                patchForm('specs', [...form.specs, { key: '', value: '' }])
              }
              className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-black/15 px-4 text-sm text-neutral-500"
            >
              <Plus className="size-4" />
              添加规格参数
            </button>
          </div>
        </Section>
      </form>

      {productId ? (
        <div className="mt-5">
          <Section
            icon={<Layers3 className="size-5" />}
            title="变体与 BOM"
            description="启用的变体必须配置至少一种耗材；可售数直接来自库存可售视图"
            action={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGeneratorOpen(true)}
                  className="flex h-9 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-medium"
                >
                  <Sparkles className="size-3.5" />
                  批量生成
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVariants((current) => [
                      ...current,
                      newVariant(current.length),
                    ]);
                    setExpanded((current) =>
                      new Set(current).add(variants.length),
                    );
                  }}
                  className="flex h-9 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-xs font-medium"
                >
                  <Plus className="size-3.5" />
                  手动添加
                </button>
              </div>
            }
          >
            <div className="divide-y divide-black/5">
              {variants.length === 0 ? (
                <div className="flex h-48 flex-col items-center justify-center text-neutral-400">
                  <Layers3 className="size-8" />
                  <p className="mt-3 text-sm">暂无变体，请手动添加或批量生成</p>
                </div>
              ) : null}
              {variants.map((variant, index) => {
                const open = expanded.has(index);
                return (
                  <div key={variant.id ?? index}>
                    <div className="grid grid-cols-[minmax(220px,1fr)_120px_100px_110px_auto] items-center gap-3 px-5 py-4 sm:px-7">
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(index)) next.delete(index);
                            else next.add(index);
                            return next;
                          })
                        }
                        className="flex min-w-0 items-center gap-3 text-left"
                      >
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-xl ${variant.isActive ? 'bg-lime-100 text-lime-800' : 'bg-neutral-100 text-neutral-400'}`}
                        >
                          {open ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">
                            {variant.name || '未命名变体'}
                          </span>
                          <span className="mt-0.5 block truncate font-mono text-xs text-neutral-400">
                            {variant.skuCode}
                          </span>
                        </span>
                      </button>
                      <span className="text-sm font-semibold tabular-nums">
                        ¥{variant.price}
                      </span>
                      <span
                        className={`text-sm font-semibold ${variant.availableQty && variant.availableQty > 0 ? 'text-emerald-700' : 'text-neutral-400'}`}
                      >
                        可售 {variant.availableQty ?? '保存后计算'}
                      </span>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={variant.isActive}
                          onChange={(event) =>
                            patchVariant(index, {
                              isActive: event.target.checked,
                            })
                          }
                          className="size-4 accent-neutral-900"
                        />
                        启用
                      </label>
                      <button
                        type="button"
                        onClick={() =>
                          setVariants((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                        className="rounded-lg p-2 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    {open ? (
                      <div className="border-t border-black/5 bg-neutral-50/60 px-5 py-5 sm:px-7">
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          <Field label="SKU 编码">
                            <input
                              value={variant.skuCode}
                              onChange={(event) =>
                                patchVariant(index, {
                                  skuCode: event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="变体名称">
                            <input
                              value={variant.name}
                              onChange={(event) =>
                                patchVariant(index, {
                                  name: event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="销售价">
                            <input
                              inputMode="decimal"
                              value={variant.price}
                              onChange={(event) =>
                                patchVariant(index, {
                                  price: event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="划线价">
                            <input
                              inputMode="decimal"
                              value={variant.comparePrice}
                              onChange={(event) =>
                                patchVariant(index, {
                                  comparePrice: event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="成品重量（g）">
                            <input
                              inputMode="decimal"
                              value={variant.weightGrams}
                              onChange={(event) =>
                                patchVariant(index, {
                                  weightGrams: event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <Field label="打印工时（小时）">
                            <input
                              inputMode="decimal"
                              value={variant.printHours}
                              onChange={(event) =>
                                patchVariant(index, {
                                  printHours: event.target.value,
                                })
                              }
                              className={inputClass}
                            />
                          </Field>
                          <div className="sm:col-span-2">
                            <Field label="变体图片 URL">
                              <div className="flex gap-2">
                                <input
                                  type="url"
                                  value={variant.imageUrl}
                                  onChange={(event) =>
                                    patchVariant(index, {
                                      imageUrl: event.target.value,
                                    })
                                  }
                                  className={inputClass}
                                />
                                <AssetUploadButton
                                  type="image"
                                  label="上传图片"
                                  onUploaded={(url) => {
                                    patchVariant(index, { imageUrl: url });
                                    setNotice('变体图片上传成功');
                                  }}
                                  onError={setError}
                                />
                              </div>
                            </Field>
                          </div>
                        </div>
                        <div className="mt-5 rounded-2xl border border-black/6 bg-white p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-semibold">
                                耗材 BOM
                              </h3>
                              <p className="mt-1 text-xs text-neutral-400">
                                一件该变体需要消耗的耗材克数，可添加多种。
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                patchVariant(index, {
                                  bom: [
                                    ...variant.bom,
                                    { materialId: '', grams: '0.00' },
                                  ],
                                })
                              }
                              className="flex h-9 items-center gap-2 rounded-xl bg-neutral-100 px-3 text-xs font-medium"
                            >
                              <Plus className="size-3.5" />
                              添加耗材
                            </button>
                          </div>
                          <div className="mt-4 space-y-2">
                            {variant.bom.length === 0 ? (
                              <p
                                className={`rounded-xl p-3 text-sm ${variant.isActive ? 'bg-red-50 text-red-700' : 'bg-neutral-50 text-neutral-400'}`}
                              >
                                {variant.isActive
                                  ? '启用变体必须至少配置一种耗材。'
                                  : '当前未配置耗材。'}
                              </p>
                            ) : null}
                            {variant.bom.map((bom, bomIndex) => {
                              const selected = materials.find(
                                (material) => material.id === bom.materialId,
                              );
                              return (
                                <div
                                  key={bomIndex}
                                  className="grid gap-2 sm:grid-cols-[1fr_170px_auto]"
                                >
                                  <select
                                    value={bom.materialId}
                                    onChange={(event) =>
                                      patchVariant(index, {
                                        bom: variant.bom.map(
                                          (item, itemIndex) =>
                                            itemIndex === bomIndex
                                              ? {
                                                  ...item,
                                                  materialId:
                                                    event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                    className={inputClass}
                                  >
                                    <option value="">选择耗材</option>
                                    {materials.map((material) => (
                                      <option
                                        key={material.id}
                                        value={material.id}
                                      >
                                        {material.code} · {material.name}
                                        {material.isActive ? '' : '（已停用）'}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    inputMode="decimal"
                                    value={bom.grams}
                                    onChange={(event) =>
                                      patchVariant(index, {
                                        bom: variant.bom.map(
                                          (item, itemIndex) =>
                                            itemIndex === bomIndex
                                              ? {
                                                  ...item,
                                                  grams: event.target.value,
                                                }
                                              : item,
                                        ),
                                      })
                                    }
                                    className={inputClass}
                                    placeholder="克数/件"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      patchVariant(index, {
                                        bom: variant.bom.filter(
                                          (_, itemIndex) =>
                                            itemIndex !== bomIndex,
                                        ),
                                      })
                                    }
                                    className="grid size-11 place-items-center rounded-xl text-neutral-400 hover:bg-red-50 hover:text-red-600"
                                  >
                                    <Trash2 className="size-4" />
                                  </button>
                                  {selected ? (
                                    <p className="text-xs text-neutral-400 sm:col-span-3">
                                      当前可用 {selected.availableGrams}g ·{' '}
                                      {selected.isActive
                                        ? '耗材启用'
                                        : '耗材已停用，变体可售数将为 0'}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between border-t border-black/6 bg-neutral-50 px-5 py-4 sm:px-7">
              <p className="text-xs text-neutral-400">
                保存后会覆盖当前商品的全部变体和 BOM。
              </p>
              <button
                type="button"
                disabled={savingVariants}
                onClick={() => void saveVariants()}
                className="flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingVariants ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                保存变体与 BOM
              </button>
            </div>
          </Section>
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-black/12 bg-white p-8 text-center text-sm text-neutral-500">
          保存商品基础信息后，即可配置变体和耗材 BOM。
        </div>
      )}

      {generatorOpen ? (
        <GeneratorModal
          productSlug={form.slug}
          existingVariants={variants}
          onClose={() => setGeneratorOpen(false)}
          onGenerate={(generated) => {
            setVariants((current) => [...current, ...generated]);
            setExpanded(
              new Set(generated.map((_, index) => variants.length + index)),
            );
            setGeneratorOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
