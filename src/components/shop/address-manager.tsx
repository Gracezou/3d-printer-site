'use client';

import { Check, MapPin, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';

import { chinaProvinces, parseChineseAddress } from '@/lib/address-parser';

interface Address {
  id: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  provinceCode: string;
  city: string;
  district: string;
  detail: string;
  postalCode: string | null;
  isDefault: boolean;
}

interface AddressResponse {
  code: number;
  data: { addresses: Address[] } | Address | null;
  message: string;
}

interface ProfileResponse {
  code: number;
  data: { phone: string | null } | null;
  message: string;
}

type AddressDraft = Omit<Address, 'id'>;

const emptyDraft: AddressDraft = {
  receiverName: '',
  receiverPhone: '',
  province: '',
  provinceCode: '',
  city: '',
  district: '',
  detail: '',
  postalCode: null,
  isDefault: false,
};

export function AddressManager() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);
  const [profilePhone, setProfilePhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [quickInput, setQuickInput] = useState('');
  const [parseMessage, setParseMessage] = useState<string | null>(null);

  const loadAddresses = useCallback(async () => {
    setLoading(true);
    try {
      const [response, profileResponse] = await Promise.all([
        fetch('/api/addresses', { cache: 'no-store' }),
        fetch('/api/auth/me', { cache: 'no-store' }),
      ]);
      if (response.status === 401) {
        window.location.assign('/auth/login?next=%2Faccount%2Faddresses');
        return;
      }
      const body = (await response.json()) as AddressResponse;
      if (!response.ok || !body.data || !('addresses' in body.data))
        throw new Error(body.message);
      setAddresses(body.data.addresses);
      if (profileResponse.ok) {
        const profileBody = (await profileResponse.json()) as ProfileResponse;
        setProfilePhone(profileBody.data?.phone ?? '');
      }
      setMessage(null);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '地址加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void loadAddresses(), [loadAddresses]);

  function openCreate(): void {
    setEditingId(null);
    setDraft({
      ...emptyDraft,
      receiverPhone: profilePhone,
      isDefault: addresses.length === 0,
    });
    setMessage(null);
    setQuickInput('');
    setParseMessage(null);
    setFormOpen(true);
  }

  function openEdit(address: Address): void {
    setEditingId(address.id);
    setDraft({
      receiverName: address.receiverName,
      receiverPhone: address.receiverPhone,
      province: address.province,
      provinceCode: address.provinceCode,
      city: address.city,
      district: address.district,
      detail: address.detail,
      postalCode: address.postalCode,
      isDefault: address.isDefault,
    });
    setMessage(null);
    setQuickInput('');
    setParseMessage(null);
    setFormOpen(true);
  }

  function recognizeAddress(): void {
    const parsed = parseChineseAddress(quickInput);
    setDraft((current) => ({
      ...current,
      receiverName: parsed.receiverName ?? current.receiverName,
      receiverPhone: parsed.receiverPhone ?? current.receiverPhone,
      province: parsed.province ?? current.province,
      provinceCode: parsed.provinceCode ?? current.provinceCode,
      city: parsed.city ?? current.city,
      district: parsed.district ?? current.district,
      detail: parsed.detail ?? current.detail,
      postalCode: parsed.postalCode ?? current.postalCode,
    }));
    setParseMessage(
      parsed.warnings.length
        ? `已填入可识别内容；${parsed.warnings.join('、')}，请核对。`
        : '识别完成，请核对后保存。',
    );
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(
        editingId ? `/api/addresses/${editingId}` : '/api/addresses',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        },
      );
      const body = (await response.json()) as AddressResponse;
      if (!response.ok) throw new Error(body.message);
      setFormOpen(false);
      await loadAddresses();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '地址保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(path: string, method: 'POST' | 'DELETE') {
    setMessage(null);
    try {
      const response = await fetch(path, { method });
      const body = (await response.json()) as AddressResponse;
      if (!response.ok) throw new Error(body.message);
      await loadAddresses();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '操作失败');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-stone-500">最多可保存多个常用收货地址。</p>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#17251c] px-5 text-sm font-bold text-white"
        >
          <Plus className="size-4" /> 新增地址
        </button>
      </div>

      {message ? (
        <p className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {message}
        </p>
      ) : null}
      {loading ? (
        <p className="py-20 text-center text-sm text-stone-500">
          正在加载地址…
        </p>
      ) : null}
      {!loading && addresses.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-stone-900/15 py-16 text-center">
          <MapPin className="mx-auto size-10 text-stone-300" />
          <p className="mt-4 font-semibold">还没有收货地址</p>
          <p className="mt-1 text-sm text-stone-500">
            新增地址后，下单时可以直接选择。
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {addresses.map((address) => (
          <article
            key={address.id}
            className={`rounded-3xl border p-6 ${address.isDefault ? 'border-[#59705f] bg-[#e8ecdf]/60' : 'border-stone-900/8 bg-white/70'}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{address.receiverName}</strong>
                  <span className="text-sm text-stone-500">
                    {address.receiverPhone}
                  </span>
                  {address.isDefault ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#17251c] px-2.5 py-1 text-[10px] font-bold text-white">
                      <Check className="size-3" />
                      默认地址
                    </span>
                  ) : null}
                </div>
                <p className="mt-4 text-sm leading-7 text-stone-600">
                  {address.province} {address.city} {address.district}
                  <br />
                  {address.detail}
                  {address.postalCode ? `（${address.postalCode}）` : ''}
                </p>
              </div>
              <MapPin className="size-5 shrink-0 text-[#59705f]" />
            </div>
            <div className="mt-5 flex flex-wrap gap-2 border-t border-stone-900/8 pt-4">
              {!address.isDefault ? (
                <button
                  type="button"
                  onClick={() =>
                    void runAction(
                      `/api/addresses/${address.id}/default`,
                      'POST',
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-full border border-stone-900/10 px-3 py-1.5 text-xs font-semibold"
                >
                  <Star className="size-3.5" />
                  设为默认
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => openEdit(address)}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-900/10 px-3 py-1.5 text-xs font-semibold"
              >
                <Pencil className="size-3.5" />
                编辑
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('确定删除这个收货地址吗？'))
                    void runAction(`/api/addresses/${address.id}`, 'DELETE');
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-900/10 px-3 py-1.5 text-xs font-semibold text-red-600"
              >
                <Trash2 className="size-3.5" />
                删除
              </button>
            </div>
          </article>
        ))}
      </div>

      {formOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-stone-950/45 p-4 backdrop-blur-sm">
          <form
            onSubmit={submit}
            className="my-6 w-full max-w-2xl rounded-3xl bg-[#f7f5ef] p-6 shadow-2xl sm:p-8"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold">
                {editingId ? '编辑收货地址' : '新增收货地址'}
              </h2>
              <button
                type="button"
                aria-label="关闭地址表单"
                onClick={() => setFormOpen(false)}
                className="grid size-9 place-items-center rounded-full hover:bg-stone-900/5"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-6 rounded-2xl border border-[#59705f]/20 bg-[#e8ecdf]/60 p-4">
              <label className="block text-sm font-semibold text-stone-700">
                快捷识别
                <textarea
                  rows={2}
                  value={quickInput}
                  onChange={(event) => setQuickInput(event.target.value)}
                  placeholder="粘贴姓名、手机号和完整地址，例如：张三 13800138000 广东省深圳市南山区……"
                  className="address-input mt-2 min-h-20 bg-white py-3 font-normal"
                />
              </label>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={!quickInput.trim()}
                  onClick={recognizeAddress}
                  className="h-9 rounded-full bg-[#17251c] px-4 text-xs font-semibold text-white disabled:opacity-40"
                >
                  识别并填入
                </button>
                {parseMessage ? (
                  <p className="flex-1 text-xs leading-5 text-stone-500">
                    {parseMessage}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <Field label="收货人姓名">
                <input
                  required
                  maxLength={50}
                  autoComplete="name"
                  value={draft.receiverName}
                  onChange={(e) =>
                    setDraft({ ...draft, receiverName: e.target.value })
                  }
                  className="address-input"
                />
              </Field>
              <Field label="手机号码">
                <input
                  required
                  inputMode="tel"
                  autoComplete="tel"
                  pattern="1[3-9][0-9]{9}"
                  value={draft.receiverPhone}
                  onChange={(e) =>
                    setDraft({ ...draft, receiverPhone: e.target.value })
                  }
                  className="address-input"
                />
              </Field>
              <Field label="省份 / 自治区 / 直辖市">
                <select
                  required
                  value={draft.provinceCode}
                  onChange={(e) => {
                    const province = chinaProvinces.find(
                      (item) => item[1] === e.target.value,
                    );
                    setDraft({
                      ...draft,
                      province: province?.[0] ?? '',
                      provinceCode: e.target.value,
                    });
                  }}
                  className="address-input"
                >
                  <option value="">请选择省份</option>
                  {chinaProvinces.map(([name, code]) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="城市">
                <input
                  required
                  maxLength={50}
                  autoComplete="address-level2"
                  value={draft.city}
                  onChange={(e) => setDraft({ ...draft, city: e.target.value })}
                  className="address-input"
                />
              </Field>
              <Field label="区 / 县">
                <input
                  required
                  maxLength={50}
                  autoComplete="address-level3"
                  value={draft.district}
                  onChange={(e) =>
                    setDraft({ ...draft, district: e.target.value })
                  }
                  className="address-input"
                />
              </Field>
              <Field label="邮政编码（选填）">
                <input
                  maxLength={10}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  value={draft.postalCode ?? ''}
                  onChange={(e) =>
                    setDraft({ ...draft, postalCode: e.target.value || null })
                  }
                  className="address-input"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="详细地址">
                  <textarea
                    required
                    maxLength={200}
                    autoComplete="street-address"
                    rows={3}
                    value={draft.detail}
                    onChange={(e) =>
                      setDraft({ ...draft, detail: e.target.value })
                    }
                    className="address-input min-h-24 py-3"
                  />
                </Field>
              </div>
            </div>
            <label className="mt-5 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.isDefault}
                disabled={Boolean(
                  editingId &&
                  addresses.find((item) => item.id === editingId)?.isDefault,
                )}
                onChange={(e) =>
                  setDraft({ ...draft, isDefault: e.target.checked })
                }
                className="size-4 accent-[#17251c]"
              />
              设为默认收货地址
            </label>
            <div className="mt-8 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="h-11 rounded-full border border-stone-900/10 px-6 text-sm font-semibold"
              >
                取消
              </button>
              <button
                disabled={saving}
                className="h-11 rounded-full bg-[#17251c] px-7 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? '保存中…' : '保存地址'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm font-semibold text-stone-700">
      <span className="mb-2 block">{label}</span>
      {children}
    </label>
  );
}
