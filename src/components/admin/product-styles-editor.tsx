'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Save, Trash2, UploadCloud } from 'lucide-react';
import {
  newProductStyle,
  previewLegacyStyles,
  productStyleDrafts,
  type StyleEditorProduct,
} from '@/lib/product-style-model';
import { materialColorLabels, type ColorMaterial } from '@/lib/style-colorways';
import {
  replaceProductStylesSchema,
  type ProductStyleInput,
} from '@/lib/validators/product-style';
import { notifyAdminUnauthorized } from '@/lib/admin-session-client';

type Material = ColorMaterial & { name: string; code: string };
const inputClass =
  'h-11 w-full rounded-md border border-black/15 bg-white px-3 text-sm';

function ImageField({
  label,
  value,
  onChange,
  onUploadChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  onUploadChange: (delta: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  return (
    <div>
      <label className="block text-sm">
        {label}
        <input
          aria-label={label}
          type="url"
          value={value ?? ''}
          placeholder="图片地址（选填）"
          className={`${inputClass} mt-2`}
          onChange={(e) => onChange(e.target.value || null)}
        />
      </label>
      <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm underline">
        <UploadCloud className="size-4" />
        {uploading ? '上传中…' : '上传图片'}
        <input
          className="sr-only"
          type="file"
          disabled={uploading}
          accept="image/jpeg,image/png,image/webp"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setUploading(true);
            onUploadChange(1);
            setError('');
            try {
              const form = new FormData();
              form.set('type', 'image');
              form.set('file', file);
              const response = await fetch('/api/admin/upload', {
                method: 'POST',
                body: form,
              });
              const result = await response.json();
              if (!response.ok || !result.data)
                throw new Error(result.message || '上传失败');
              onChange(result.data.url);
            } catch (caught) {
              setError(caught instanceof Error ? caught.message : '上传失败');
            } finally {
              setUploading(false);
              onUploadChange(-1);
            }
          }}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ProductStylesEditor<T extends StyleEditorProduct>({
  productId,
  product,
  importLegacy,
  beforeSave,
  onSaved,
  onDirtyChange,
  onSavingChange,
}: {
  productId: string;
  product: T;
  importLegacy: boolean;
  beforeSave: () => Promise<boolean>;
  onSaved: (product: T) => void;
  onDirtyChange: (dirty: boolean) => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const [styles, setStyles] = useState<ProductStyleInput[]>(() =>
    importLegacy ? previewLegacyStyles(product) : productStyleDrafts(product),
  );
  const [snapshot, setSnapshot] = useState(() =>
    JSON.stringify(importLegacy ? [] : productStyleDrafts(product)),
  );
  const [options, setOptions] = useState<Material[]>([]);
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const trackUpload = (delta: number) =>
    setUploadCount((count) => Math.max(0, count + delta));
  useEffect(() => {
    onSavingChange(saving || uploadCount > 0);
  }, [saving, uploadCount, onSavingChange]);
  useEffect(() => () => onSavingChange(false), [onSavingChange]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const lock = useRef(false);
  const dirty = JSON.stringify(styles) !== snapshot;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    let active = true;
    fetch('/api/admin/products/material-options', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.data)
          throw new Error(result.message || '耗材加载失败');
        if (active) {
          setOptions(result.data.list);
          setOptionsLoaded(true);
          setError('');
        }
      })
      .catch((caught) => {
        if (active)
          setError(caught instanceof Error ? caught.message : '耗材加载失败');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const labels = materialColorLabels(
    options.filter((m) => m.colorName?.trim()),
  );
  function patch(index: number, values: Partial<ProductStyleInput>) {
    setStyles((current) =>
      current.map((s, i) => (i === index ? { ...s, ...values } : s)),
    );
  }
  async function save() {
    if (lock.current || uploadCount > 0) return;
    setError('');
    setMessage('');
    const parsed = replaceProductStylesSchema.safeParse({ styles });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join('；'));
      return;
    }
    lock.current = true;
    setSaving(true);
    try {
      if (!(await beforeSave()))
        throw new Error('基础信息未保存，请检查上方提示');
      const response = await fetch(`/api/admin/products/${productId}/styles`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json();
      if (response.status === 401) notifyAdminUnauthorized();
      if (!response.ok || !result.data)
        throw new Error(result.message || '保存失败');
      const saved = productStyleDrafts(result.data);
      setStyles(saved);
      setSnapshot(JSON.stringify(saved));
      onSaved(result.data);
      setMessage('款式与配色已保存，单色 SKU 与库存已同步');
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : '保存失败，草稿仍保留',
      );
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className="mt-5 rounded-lg border border-black/10 bg-white"
      aria-label="款式与配色编辑器"
    >
      <div className="border-b border-black/10 p-5">
        <h2 className="font-semibold">款式与配色</h2>
        <p className="mt-2 text-sm text-neutral-500">
          款式决定价格和单件用量；单色可自动同步，多色按方案分别填写耗材。
        </p>
        {importLegacy ? (
          <p className="mt-2 text-sm text-amber-800">
            这是旧规格的整理预览。请核对款式、配色、价格与用量；保存后生效，原有销售记录保留。未启用的旧
            SKU 不会自动上架。
          </p>
        ) : null}
      </div>
      {message ? (
        <p
          role="status"
          className="m-5 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="m-5 rounded-md bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
          {!optionsLoaded ? (
            <button
              type="button"
              className="ml-3 underline"
              onClick={() => setAttempt((v) => v + 1)}
            >
              重新加载耗材
            </button>
          ) : null}
        </div>
      ) : null}
      <fieldset
        disabled={saving || uploadCount > 0}
        className="min-w-0 space-y-5 p-5"
      >
        {styles.map((style, index) => (
          <fieldset
            key={style.id ?? `new-${index}`}
            className="min-w-0 space-y-4 rounded-lg border border-black/15 p-4"
          >
            <legend className="px-2 font-semibold">
              {style.name || `款式 ${index + 1}`}
            </legend>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={style.isActive}
                  onChange={(e) => patch(index, { isActive: e.target.checked })}
                />
                启用此款式
              </label>
              <button
                type="button"
                className="min-h-11 text-sm text-red-700"
                onClick={() => {
                  if (window.confirm('移除此款式？保存后相关 SKU 将停止销售。'))
                    setStyles((current) =>
                      current.filter((_, i) => i !== index),
                    );
                }}
              >
                移除款式
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="text-sm">
                款式名称
                <input
                  className={`${inputClass} mt-2`}
                  value={style.name}
                  onChange={(e) => patch(index, { name: e.target.value })}
                />
              </label>
              <label className="text-sm">
                售价（元）
                <input
                  inputMode="decimal"
                  className={`${inputClass} mt-2`}
                  value={style.price}
                  onChange={(e) => patch(index, { price: e.target.value })}
                />
              </label>
              <label className="text-sm">
                成品重量（g）
                <input
                  inputMode="decimal"
                  className={`${inputClass} mt-2`}
                  value={style.weightGrams}
                  onChange={(e) =>
                    patch(index, { weightGrams: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                单色耗材用量（g/件）
                <input
                  inputMode="decimal"
                  className={`${inputClass} mt-2`}
                  value={style.materialGrams}
                  onChange={(e) =>
                    patch(index, { materialGrams: e.target.value })
                  }
                />
              </label>
              <label className="text-sm">
                打印工时（小时）
                <input
                  inputMode="decimal"
                  className={`${inputClass} mt-2`}
                  value={style.printHours ?? ''}
                  onChange={(e) =>
                    patch(index, { printHours: e.target.value || null })
                  }
                />
              </label>
            </div>
            <p className="text-xs text-neutral-500">
              成品重量用于重量及运费；单色用量用于库存，损耗率由系统另计。多色用量在配色方案内填写。
            </p>
            <ImageField
              onUploadChange={trackUpload}
              label="款式默认图片"
              value={style.imageUrl}
              onChange={(imageUrl) => patch(index, { imageUrl })}
            />
            <label className="block text-sm">
              单色耗材模式
              <select
                className={`${inputClass} mt-2`}
                value={style.singleMaterialMode}
                aria-label="单色耗材模式"
                onChange={(e) =>
                  patch(index, {
                    singleMaterialMode: e.target
                      .value as ProductStyleInput['singleMaterialMode'],
                  })
                }
              >
                <option value="none">不生成单色，仅使用预设配色</option>
                <option value="selected">指定耗材</option>
                <option value="all">全部耗材 · 自动同步新增颜色</option>
              </select>
            </label>
            {style.singleMaterialMode === 'all' ? (
              <p className="text-sm text-neutral-600">
                自动添加有颜色名称的已启用耗材，库存不足的颜色不可购买。多色方案不会自动组合。
              </p>
            ) : null}
            {style.singleMaterialMode === 'selected' ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {options
                  .filter((m) => m.colorName?.trim())
                  .map((m) => (
                    <label
                      key={m.id}
                      className="flex min-h-11 items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={style.materialIds.includes(m.id)}
                        onChange={(e) =>
                          patch(index, {
                            materialIds: e.target.checked
                              ? [...style.materialIds, m.id]
                              : style.materialIds.filter((id) => id !== m.id),
                          })
                        }
                      />
                      {labels.get(m.id)}
                      {!m.isActive ? '（停用）' : ''}
                    </label>
                  ))}
              </div>
            ) : null}
            {style.singleMaterialMode !== 'none' ? (
              <details className="rounded-md border border-black/10 p-3">
                <summary className="cursor-pointer text-sm">
                  单色专属图片（选填）
                </summary>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {options
                    .filter(
                      (m) =>
                        m.colorName?.trim() &&
                        (style.singleMaterialMode === 'all' ||
                          style.materialIds.includes(m.id)),
                    )
                    .map((m) => (
                      <ImageField
                        onUploadChange={trackUpload}
                        key={m.id}
                        label={`${labels.get(m.id)} 图片`}
                        value={
                          style.singleImages.find((i) => i.materialId === m.id)
                            ?.imageUrl ?? null
                        }
                        onChange={(imageUrl) =>
                          patch(index, {
                            singleImages: [
                              ...style.singleImages.filter(
                                (i) => i.materialId !== m.id,
                              ),
                              { materialId: m.id, imageUrl },
                            ],
                          })
                        }
                      />
                    ))}
                </div>
              </details>
            ) : null}
            <div className="border-t border-black/10 pt-4">
              <h3 className="text-sm font-semibold">预设配色方案</h3>
              <p className="mt-1 text-xs text-neutral-500">
                例如黑白拼色：黑色 20g＋白色
                10g。相同耗材会合并用量，不会重复计算库存。
              </p>
              {style.colorways.map((color, ci) => (
                <div
                  key={color.id ?? `color-${ci}`}
                  className="mt-3 space-y-3 rounded-md bg-neutral-50 p-4"
                >
                  <label className="block text-sm">
                    配色名称
                    <input
                      className={`${inputClass} mt-2`}
                      value={color.name}
                      onChange={(e) =>
                        patch(index, {
                          colorways: style.colorways.map((c, i) =>
                            i === ci ? { ...c, name: e.target.value } : c,
                          ),
                        })
                      }
                    />
                  </label>
                  <ImageField
                    onUploadChange={trackUpload}
                    label="配色专属图片"
                    value={color.imageUrl}
                    onChange={(imageUrl) =>
                      patch(index, {
                        colorways: style.colorways.map((c, i) =>
                          i === ci ? { ...c, imageUrl } : c,
                        ),
                      })
                    }
                  />
                  {color.bom.map((bom, bi) => (
                    <div
                      key={bi}
                      className="grid grid-cols-[minmax(0,1fr)_7rem_auto] items-end gap-2"
                    >
                      <label className="min-w-0 text-sm">
                        耗材
                        <select
                          className={`${inputClass} mt-2`}
                          value={bom.materialId}
                          aria-label="耗材"
                          onChange={(e) =>
                            patch(index, {
                              colorways: style.colorways.map((c, i) =>
                                i === ci
                                  ? {
                                      ...c,
                                      bom: c.bom.map((b, j) =>
                                        j === bi
                                          ? { ...b, materialId: e.target.value }
                                          : b,
                                      ),
                                    }
                                  : c,
                              ),
                            })
                          }
                        >
                          <option value="">选择耗材</option>
                          {options.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                              {!m.isActive ? '（停用）' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm">
                        用量（g/件）
                        <input
                          inputMode="decimal"
                          className={`${inputClass} mt-2`}
                          value={bom.grams}
                          onChange={(e) =>
                            patch(index, {
                              colorways: style.colorways.map((c, i) =>
                                i === ci
                                  ? {
                                      ...c,
                                      bom: c.bom.map((b, j) =>
                                        j === bi
                                          ? { ...b, grams: e.target.value }
                                          : b,
                                      ),
                                    }
                                  : c,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        aria-label="移除此耗材"
                        className="grid size-11 place-items-center text-red-700"
                        onClick={() =>
                          patch(index, {
                            colorways: style.colorways.map((c, i) =>
                              i === ci
                                ? {
                                    ...c,
                                    bom: c.bom.filter((_, j) => j !== bi),
                                  }
                                : c,
                            ),
                          })
                        }
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap justify-between gap-2">
                    <button
                      type="button"
                      className="min-h-11 text-sm underline"
                      onClick={() =>
                        patch(index, {
                          colorways: style.colorways.map((c, i) =>
                            i === ci
                              ? {
                                  ...c,
                                  bom: [
                                    ...c.bom,
                                    { materialId: '', grams: '1.00' },
                                  ],
                                }
                              : c,
                          ),
                        })
                      }
                    >
                      添加配色耗材
                    </button>
                    <button
                      type="button"
                      className="min-h-11 text-sm text-red-700"
                      onClick={() =>
                        patch(index, {
                          colorways: style.colorways.filter((_, i) => i !== ci),
                        })
                      }
                    >
                      移除此配色
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm underline"
                onClick={() =>
                  patch(index, {
                    colorways: [
                      ...style.colorways,
                      {
                        id: null,
                        name: '',
                        imageUrl: null,
                        bom: [{ materialId: '', grams: style.materialGrams }],
                      },
                    ],
                  })
                }
              >
                <Plus className="size-4" />
                添加预设配色
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          className="inline-flex min-h-11 items-center gap-2 text-sm underline"
          onClick={() =>
            setStyles((current) => [...current, newProductStyle()])
          }
        >
          <Plus className="size-4" />
          添加款式
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 pt-4">
          <p className="text-sm text-neutral-500">
            {dirty ? '款式与配色有未保存修改' : '款式与配色已保存'}
          </p>
          <button
            type="button"
            disabled={saving || !optionsLoaded}
            onClick={() => void save()}
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-neutral-900 px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? '正在保存…' : '保存款式与配色及基础修改'}
          </button>
        </div>
      </fieldset>
    </section>
  );
}
