'use client';

import {
  ArrowDownToLine,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Filter,
  LoaderCircle,
  PackageOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ToggleLeft,
  ToggleRight,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

interface Material {
  id: string;
  code: string;
  name: string;
  materialType: string;
  colorName: string | null;
  colorHex: string | null;
  brand: string | null;
  spec: string | null;
  unitCostPerKg: string;
  stockGrams: string;
  reservedGrams: string;
  safetyGrams: string;
  availableGrams: string;
  wasteRate: string;
  isActive: boolean;
  supplier: string | null;
  remark: string | null;
  isLowStock: boolean;
  usedByVariantCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Movement {
  id: string;
  movementType: string;
  deltaStockGrams: string;
  deltaReservedGrams: string;
  stockAfter: string;
  reservedAfter: string;
  refType: string | null;
  refId: string | null;
  batchNo: string | null;
  unitCostPerKg: string | null;
  remark: string | null;
  createdAt: string;
}

interface VariantReference {
  variantId: string;
  skuCode: string;
  variantName: string;
  productId: string;
  productName: string;
  grams: string;
  isActive: boolean;
  availableQty: number;
}

interface ListResult<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

interface MaterialsManagerProps {
  permissions: {
    edit: boolean;
    stockIn: boolean;
    adjust: boolean;
  };
}

const materialTypes = [
  'PLA',
  'PETG',
  'ABS',
  'TPU',
  'ASA',
  'PA',
  'RESIN',
  'OTHER',
] as const;

const movementLabels: Record<string, string> = {
  purchase_in: '采购入库',
  manual_in: '手动入库',
  manual_out: '手动出库',
  adjust: '盘点调整',
  reserve: '订单预扣',
  reserve_release: '释放预扣',
  consume: '生产消耗',
  reprint_loss: '重打损耗',
  refund_return: '退款退料',
};

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
      ? { 'Content-Type': 'application/json', ...init.headers }
      : init?.headers,
  });
  const result = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || result.data === null) {
    if (response.status === 401) {
      window.location.assign('/admin/login');
    }
    throw new Error(result.message || '请求失败');
  }
  return result.data;
}

function formatGrams(value: string): string {
  return `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 })} g`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
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
        className={`relative max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${
          wide ? 'max-w-5xl' : 'max-w-2xl'
        }`}
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
            className="rounded-xl bg-neutral-100 p-2 text-neutral-500 transition hover:bg-neutral-200 hover:text-neutral-900"
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
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
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

const inputClass =
  'h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

function SubmitBar({
  onClose,
  submitting,
  label,
}: {
  onClose: () => void;
  submitting: boolean;
  label: string;
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
        className="flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
        {label}
      </button>
    </div>
  );
}

function MaterialEditor({
  material,
  onClose,
  onSaved,
}: {
  material: Material | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    code: material?.code ?? '',
    name: material?.name ?? '',
    materialType: material?.materialType ?? 'PLA',
    colorName: material?.colorName ?? '',
    colorHex: material?.colorHex ?? '#000000',
    brand: material?.brand ?? '',
    spec: material?.spec ?? '1.75mm / 1kg',
    unitCostPerKg: material?.unitCostPerKg ?? '0.00',
    safetyGrams: material?.safetyGrams ?? '0.00',
    wasteRate: material?.wasteRate ?? '0.0500',
    supplier: material?.supplier ?? '',
    remark: material?.remark ?? '',
  });

  function change(name: keyof typeof form, value: string): void {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        ...form,
        colorName: form.colorName || null,
        colorHex: form.colorHex || null,
        brand: form.brand || null,
        spec: form.spec || null,
        supplier: form.supplier || null,
        remark: form.remark || null,
      };
      await apiRequest<Material>(
        material
          ? `/api/admin/materials/${material.id}`
          : '/api/admin/materials',
        {
          method: material ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      onSaved(material ? '耗材信息已更新' : '耗材已创建');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={material ? '编辑耗材' : '新增耗材'}
      description="库存数量需通过入库或盘点调整，不能在此直接修改。"
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          <Field label="耗材编码">
            <input
              required
              maxLength={64}
              value={form.code}
              onChange={(event) => change('code', event.target.value)}
              className={inputClass}
              placeholder="PLA-BLK-175"
            />
          </Field>
          <Field label="耗材名称">
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(event) => change('name', event.target.value)}
              className={inputClass}
              placeholder="PLA 黑色 1.75mm"
            />
          </Field>
          <Field label="类型">
            <select
              value={form.materialType}
              onChange={(event) => change('materialType', event.target.value)}
              className={inputClass}
            >
              {materialTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </Field>
          <Field label="规格">
            <input
              value={form.spec}
              onChange={(event) => change('spec', event.target.value)}
              className={inputClass}
              placeholder="1.75mm / 1kg"
            />
          </Field>
          <Field label="颜色名称">
            <input
              value={form.colorName}
              onChange={(event) => change('colorName', event.target.value)}
              className={inputClass}
              placeholder="曜石黑"
            />
          </Field>
          <Field label="色值">
            <div className="flex gap-2">
              <input
                type="color"
                value={form.colorHex || '#000000'}
                onChange={(event) => change('colorHex', event.target.value)}
                className="h-11 w-14 rounded-xl border border-black/10 bg-white p-1"
              />
              <input
                value={form.colorHex}
                onChange={(event) => change('colorHex', event.target.value)}
                className={inputClass}
                placeholder="#000000"
              />
            </div>
          </Field>
          <Field label="品牌">
            <input
              value={form.brand}
              onChange={(event) => change('brand', event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="供应商">
            <input
              value={form.supplier}
              onChange={(event) => change('supplier', event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="成本（元/kg）">
            <input
              required
              inputMode="decimal"
              value={form.unitCostPerKg}
              onChange={(event) => change('unitCostPerKg', event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="安全库存（g）"
            hint="为防止订单占用全部库存而预留的缓冲量。可用克数 = 在库克数 − 预扣克数 − 安全库存。"
          >
            <input
              required
              inputMode="decimal"
              value={form.safetyGrams}
              onChange={(event) => change('safetyGrams', event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field
            label="损耗率"
            hint="用于覆盖支撑材料、料头和打印失败等损耗。实际扣料 = BOM 克数 ×（1 + 损耗率）；例如 5% 填写 0.0500。"
          >
            <input
              required
              inputMode="decimal"
              value={form.wasteRate}
              onChange={(event) => change('wasteRate', event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="备注">
            <input
              value={form.remark}
              onChange={(event) => change('remark', event.target.value)}
              className={inputClass}
            />
          </Field>
          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          ) : null}
        </div>
        <SubmitBar
          onClose={onClose}
          submitting={submitting}
          label={material ? '保存修改' : '创建耗材'}
        />
      </form>
    </Modal>
  );
}

function StockInDialog({
  material,
  onClose,
  onSaved,
}: {
  material: Material;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/admin/materials/${material.id}/stock-in`, {
        method: 'POST',
        body: JSON.stringify({
          grams: data.get('grams'),
          unitCostPerKg: data.get('unitCostPerKg'),
          batchNo: data.get('batchNo') || null,
          remark: data.get('remark') || null,
        }),
      });
      onSaved('入库完成，库存流水已记录');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '入库失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="采购入库"
      description={`${material.code} · 当前在库 ${formatGrams(material.stockGrams)}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid gap-5 px-5 py-6 sm:grid-cols-2 sm:px-7">
          <Field label="入库克数">
            <input
              name="grams"
              required
              inputMode="decimal"
              className={inputClass}
              placeholder="1000.00"
            />
          </Field>
          <Field label="本批成本（元/kg）">
            <input
              name="unitCostPerKg"
              required
              inputMode="decimal"
              className={inputClass}
              defaultValue={material.unitCostPerKg}
            />
          </Field>
          <Field label="批次号">
            <input
              name="batchNo"
              maxLength={64}
              className={inputClass}
              placeholder="B20260828"
            />
          </Field>
          <Field label="备注">
            <input
              name="remark"
              maxLength={2000}
              className={inputClass}
              placeholder="补货说明（选填）"
            />
          </Field>
          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 sm:col-span-2">
              {error}
            </p>
          ) : null}
        </div>
        <SubmitBar onClose={onClose} submitting={submitting} label="确认入库" />
      </form>
    </Modal>
  );
}

function AdjustDialog({
  material,
  onClose,
  onSaved,
}: {
  material: Material;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSubmitting(true);
    setError('');
    try {
      await apiRequest(`/api/admin/materials/${material.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          targetGrams: data.get('targetGrams'),
          remark: data.get('remark'),
        }),
      });
      onSaved('库存调整完成，盘点流水已记录');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '调整失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title="盘点调整"
      description={`${material.code} · 系统在库 ${formatGrams(material.stockGrams)}`}
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="space-y-5 px-5 py-6 sm:px-7">
          <Field label="盘点后的实际库存（g）">
            <input
              name="targetGrams"
              required
              inputMode="decimal"
              className={inputClass}
              defaultValue={material.stockGrams}
            />
          </Field>
          <Field
            label="调整原因"
            hint="盘点调整会记录调整差额及调整后的库存快照。"
          >
            <textarea
              name="remark"
              required
              maxLength={2000}
              className="min-h-24 w-full rounded-xl border border-black/10 p-3 text-sm outline-none focus:border-neutral-500"
              placeholder="请填写盘点差异原因"
            />
          </Field>
          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <SubmitBar onClose={onClose} submitting={submitting} label="确认调整" />
      </form>
    </Modal>
  );
}

function MovementsDialog({
  material,
  onClose,
}: {
  material: Material;
  onClose: () => void;
}) {
  const [result, setResult] = useState<ListResult<Movement> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    if (type) params.set('type', type);
    if (startDate)
      params.set('startDate', new Date(`${startDate}T00:00:00`).toISOString());
    if (endDate)
      params.set('endDate', new Date(`${endDate}T23:59:59.999`).toISOString());
    try {
      setResult(
        await apiRequest(
          `/api/admin/materials/${material.id}/movements?${params}`,
        ),
      );
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '流水加载失败');
    } finally {
      setLoading(false);
    }
  }, [endDate, material.id, startDate, type]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal
      title="库存流水"
      description={`${material.code} · ${material.name}`}
      onClose={onClose}
      wide
    >
      <div className="border-b border-black/6 bg-neutral-50 px-5 py-4 sm:px-7">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
            className={inputClass}
          >
            <option value="">全部类型</option>
            {Object.entries(movementLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            className={inputClass}
          />
          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => void load()}
            className="h-11 rounded-xl bg-[#151816] px-4 text-sm font-medium text-white"
          >
            筛选
          </button>
        </div>
      </div>
      <div className="min-h-60 overflow-x-auto px-5 py-5 sm:px-7">
        {loading ? (
          <div className="grid h-44 place-items-center text-neutral-400">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {!loading && !error && result?.list.length === 0 ? (
          <div className="grid h-44 place-items-center text-sm text-neutral-400">
            暂无库存流水
          </div>
        ) : null}
        {!loading && result && result.list.length > 0 ? (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-xs text-neutral-400">
              <tr className="border-b border-black/6">
                <th className="pb-3 font-medium">时间 / 类型</th>
                <th className="pb-3 font-medium">库存变化</th>
                <th className="pb-3 font-medium">调整前 → 调整后</th>
                <th className="pb-3 font-medium">批次 / 关联</th>
                <th className="pb-3 font-medium">备注</th>
              </tr>
            </thead>
            <tbody>
              {result.list.map((movement) => {
                const before =
                  Number(movement.stockAfter) -
                  Number(movement.deltaStockGrams);
                const delta = Number(movement.deltaStockGrams);
                return (
                  <tr
                    key={movement.id}
                    className="border-b border-black/5 last:border-0"
                  >
                    <td className="py-4">
                      <p className="font-medium">
                        {movementLabels[movement.movementType] ??
                          movement.movementType}
                      </p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {formatDate(movement.createdAt)}
                      </p>
                    </td>
                    <td
                      className={`py-4 font-semibold ${delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-red-600' : 'text-neutral-500'}`}
                    >
                      {delta > 0 ? '+' : ''}
                      {formatGrams(movement.deltaStockGrams)}
                    </td>
                    <td className="py-4 text-neutral-600">
                      {formatGrams(String(before))}{' '}
                      <span className="mx-1 text-neutral-300">→</span>{' '}
                      {formatGrams(movement.stockAfter)}
                    </td>
                    <td className="py-4 text-neutral-500">
                      {movement.batchNo ?? movement.refId ?? '—'}
                    </td>
                    <td
                      className="max-w-48 truncate py-4 text-neutral-500"
                      title={movement.remark ?? ''}
                    >
                      {movement.remark ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : null}
      </div>
    </Modal>
  );
}

function ToggleConfirmation({
  material,
  variants,
  onClose,
  onConfirm,
  submitting,
}: {
  material: Material;
  variants: VariantReference[];
  onClose: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <Modal
      title="确认停用耗材"
      description="停用会即时影响所有使用该耗材的商品变体。"
      onClose={onClose}
    >
      <div className="px-5 py-6 sm:px-7">
        <div className="flex gap-3 rounded-2xl bg-amber-50 p-4 text-amber-900">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <p className="text-sm leading-6">
            <strong>{material.name}</strong> 当前关联{' '}
            <strong>{variants.length}</strong>{' '}
            个变体。停用后，这些变体的可售数量会立即变为 0。
          </p>
        </div>
        {variants.length > 0 ? (
          <div className="mt-4 max-h-56 overflow-y-auto rounded-2xl border border-black/6">
            {variants.map((variant) => (
              <div
                key={variant.variantId}
                className="flex items-center justify-between border-b border-black/5 px-4 py-3 text-sm last:border-0"
              >
                <div>
                  <p className="font-medium">
                    {variant.productName} · {variant.variantName}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {variant.skuCode}
                  </p>
                </div>
                <span className="text-neutral-500">
                  {formatGrams(variant.grams)}/件
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-neutral-500">暂无关联商品变体。</p>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t border-black/6 bg-neutral-50 px-5 py-4 sm:px-7">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-xl border border-black/10 bg-white px-4 text-sm font-medium"
        >
          取消
        </button>
        <button
          type="button"
          disabled={submitting}
          onClick={onConfirm}
          className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
          确认停用
        </button>
      </div>
    </Modal>
  );
}

export function MaterialsManager({ permissions }: MaterialsManagerProps) {
  const [result, setResult] = useState<ListResult<Material> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [type, setType] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Material | 'new' | null>(null);
  const [stockTarget, setStockTarget] = useState<Material | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<Material | null>(null);
  const [movementTarget, setMovementTarget] = useState<Material | null>(null);
  const [toggleReview, setToggleReview] = useState<{
    material: Material;
    variants: VariantReference[];
  } | null>(null);
  const [busyId, setBusyId] = useState('');

  const loadMaterials = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      lowStockOnly: String(lowStockOnly),
    });
    if (keyword) params.set('keyword', keyword);
    if (type) params.set('type', type);
    try {
      setResult(await apiRequest(`/api/admin/materials?${params}`));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '耗材加载失败');
    } finally {
      setLoading(false);
    }
  }, [keyword, lowStockOnly, page, type]);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function saved(message: string): void {
    setEditor(null);
    setStockTarget(null);
    setAdjustTarget(null);
    setNotice(message);
    void loadMaterials();
  }

  async function requestToggle(material: Material): Promise<void> {
    setBusyId(material.id);
    setError('');
    try {
      if (material.isActive) {
        const references = await apiRequest<{
          list: VariantReference[];
          total: number;
        }>(`/api/admin/materials/${material.id}/variants`);
        setToggleReview({ material, variants: references.list });
      } else {
        await toggle(material, true);
      }
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setBusyId('');
    }
  }

  async function toggle(material: Material, isActive: boolean): Promise<void> {
    setBusyId(material.id);
    try {
      await apiRequest(`/api/admin/materials/${material.id}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ isActive }),
      });
      setToggleReview(null);
      setNotice(isActive ? '耗材已启用' : '耗材已停用，关联变体已即时不可售');
      await loadMaterials();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '状态更新失败');
    } finally {
      setBusyId('');
    }
  }

  const totalPages = Math.max(1, Math.ceil((result?.total ?? 0) / 20));
  const lowStockCount =
    result?.list.filter((material) => material.isLowStock).length ?? 0;

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] rounded-2xl bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            INVENTORY
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
            耗材管理
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            维护耗材档案，管理实际库存与每一次库存变化。
          </p>
        </div>
        {permissions.edit ? (
          <button
            type="button"
            onClick={() => setEditor('new')}
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-black"
          >
            <Plus className="size-4" />
            新增耗材
          </button>
        ) : null}
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">耗材档案</p>
          <p className="mt-1 text-2xl font-semibold">{result?.total ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">当前页低库存</p>
          <p
            className={`mt-1 text-2xl font-semibold ${lowStockCount > 0 ? 'text-red-600' : ''}`}
          >
            {loading ? '—' : lowStockCount}
          </p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">库存口径</p>
          <p className="mt-2 text-sm font-medium">在库 − 预扣 − 安全库存</p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-black/6 bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
        <form
          className="flex flex-col gap-3 border-b border-black/6 p-4 lg:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setKeyword(keywordInput.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              className={`${inputClass} pl-10`}
              placeholder="搜索耗材编码或名称"
            />
          </div>
          <select
            value={type}
            onChange={(event) => {
              setType(event.target.value);
              setPage(1);
            }}
            className={`${inputClass} lg:w-40`}
          >
            <option value="">全部类型</option>
            {materialTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-black/10 px-3 text-sm text-neutral-600">
            <input
              type="checkbox"
              checked={lowStockOnly}
              onChange={(event) => {
                setLowStockOnly(event.target.checked);
                setPage(1);
              }}
              className="size-4 accent-neutral-900"
            />
            <Filter className="size-4" />
            仅看低库存
          </label>
          <button className="h-11 rounded-xl bg-neutral-100 px-5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-200">
            查询
          </button>
          <button
            type="button"
            title="刷新"
            onClick={() => void loadMaterials()}
            className="grid size-11 place-items-center rounded-xl border border-black/10 text-neutral-500 hover:bg-neutral-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </form>

        {error ? (
          <div className="m-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <CircleAlert className="size-4" />
            {error}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-left text-sm">
            <thead className="bg-neutral-50/70 text-xs text-neutral-400">
              <tr>
                <th className="px-5 py-3.5 font-medium">耗材</th>
                <th className="px-4 py-3.5 font-medium">类型 / 规格</th>
                <th className="px-4 py-3.5 text-right font-medium">在库</th>
                <th className="px-4 py-3.5 text-right font-medium">预扣</th>
                <th className="px-4 py-3.5 text-right font-medium">可用</th>
                <th className="px-4 py-3.5 font-medium">安全库存 / 损耗</th>
                <th className="px-4 py-3.5 font-medium">状态</th>
                <th className="px-5 py-3.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="grid h-56 place-items-center text-neutral-400">
                      <LoaderCircle className="size-6 animate-spin" />
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading && result?.list.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="flex h-60 flex-col items-center justify-center text-neutral-400">
                      <PackageOpen className="size-9" />
                      <p className="mt-3 text-sm">暂无符合条件的耗材</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {!loading &&
                result?.list.map((material) => (
                  <tr
                    key={material.id}
                    className={`border-t border-black/5 transition hover:bg-neutral-50/70 ${material.isLowStock ? 'bg-red-50/45' : ''}`}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="size-8 shrink-0 rounded-lg border border-black/10 shadow-inner"
                          style={{
                            backgroundColor: material.colorHex ?? '#e5e5e5',
                          }}
                        />
                        <div>
                          <p className="font-semibold text-neutral-900">
                            {material.name}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-neutral-400">
                            {material.code}
                            {material.colorName
                              ? ` · ${material.colorName}`
                              : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{material.materialType}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        {material.brand || '无品牌'} ·{' '}
                        {material.spec || '未设置规格'}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-right font-medium tabular-nums">
                      {formatGrams(material.stockGrams)}
                    </td>
                    <td className="px-4 py-4 text-right text-neutral-500 tabular-nums">
                      {formatGrams(material.reservedGrams)}
                    </td>
                    <td
                      className={`px-4 py-4 text-right font-semibold tabular-nums ${material.isLowStock ? 'text-red-600' : 'text-emerald-700'}`}
                    >
                      {formatGrams(material.availableGrams)}
                      {material.isLowStock ? (
                        <span className="mt-1 block text-[10px] font-medium">
                          库存预警
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-4">
                      <p>{formatGrams(material.safetyGrams)}</p>
                      <p className="mt-1 text-xs text-neutral-400">
                        损耗 {(Number(material.wasteRate) * 100).toFixed(1)}%
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${material.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-neutral-100 text-neutral-500'}`}
                      >
                        {material.isActive ? '启用' : '已停用'}
                      </span>
                      <p className="mt-1 text-[10px] text-neutral-400">
                        关联 {material.usedByVariantCount} 个变体
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-1">
                        {permissions.stockIn ? (
                          <button
                            type="button"
                            title="入库"
                            onClick={() => setStockTarget(material)}
                            className="rounded-lg p-2 text-neutral-500 hover:bg-lime-100 hover:text-lime-800"
                          >
                            <ArrowDownToLine className="size-4" />
                          </button>
                        ) : null}
                        {permissions.adjust ? (
                          <button
                            type="button"
                            title="盘点调整"
                            onClick={() => setAdjustTarget(material)}
                            className="rounded-lg p-2 text-neutral-500 hover:bg-amber-100 hover:text-amber-800"
                          >
                            <SlidersHorizontal className="size-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          title="库存流水"
                          onClick={() => setMovementTarget(material)}
                          className="rounded-lg p-2 text-neutral-500 hover:bg-blue-100 hover:text-blue-700"
                        >
                          <ClipboardList className="size-4" />
                        </button>
                        {permissions.edit ? (
                          <button
                            type="button"
                            title="编辑"
                            onClick={() => setEditor(material)}
                            className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                          >
                            <Pencil className="size-4" />
                          </button>
                        ) : null}
                        {permissions.edit ? (
                          <button
                            type="button"
                            disabled={busyId === material.id}
                            title={material.isActive ? '停用' : '启用'}
                            onClick={() => void requestToggle(material)}
                            className={`rounded-lg p-2 ${material.isActive ? 'text-emerald-600 hover:bg-red-50 hover:text-red-600' : 'text-neutral-400 hover:bg-emerald-50 hover:text-emerald-600'}`}
                          >
                            {busyId === material.id ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : material.isActive ? (
                              <ToggleRight className="size-4" />
                            ) : (
                              <ToggleLeft className="size-4" />
                            )}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-black/6 px-5 py-4 text-sm text-neutral-500">
          <span>共 {result?.total ?? 0} 条</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
              className="grid size-9 place-items-center rounded-lg border border-black/10 disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-16 text-center">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              className="grid size-9 place-items-center rounded-lg border border-black/10 disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {editor ? (
        <MaterialEditor
          material={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {stockTarget ? (
        <StockInDialog
          material={stockTarget}
          onClose={() => setStockTarget(null)}
          onSaved={saved}
        />
      ) : null}
      {adjustTarget ? (
        <AdjustDialog
          material={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={saved}
        />
      ) : null}
      {movementTarget ? (
        <MovementsDialog
          material={movementTarget}
          onClose={() => setMovementTarget(null)}
        />
      ) : null}
      {toggleReview ? (
        <ToggleConfirmation
          material={toggleReview.material}
          variants={toggleReview.variants}
          onClose={() => setToggleReview(null)}
          onConfirm={() => void toggle(toggleReview.material, false)}
          submitting={busyId === toggleReview.material.id}
        />
      ) : null}
    </div>
  );
}
