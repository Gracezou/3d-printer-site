'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  Eye,
  Folder,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  Search,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';

import { useAdminQueryState } from '@/lib/use-admin-query-state';
import { AdminDrawer } from '@/components/admin/admin-drawer';

import { notifyAdminUnauthorized } from '@/lib/admin-session-client';

interface CategoryNode {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  imageUrl: string | null;
  sortOrder: number;
  isVisible: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
  children: CategoryNode[];
}

interface CategoryResult {
  list: CategoryNode[];
  total: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

interface EditorState {
  category: CategoryNode | null;
  defaultParentId: string | null;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body
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

const inputClass =
  'h-11 sm:h-9 w-full rounded-md border border-black/10 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

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
        className="relative max-h-[92vh] w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-lg"
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
            className="rounded-md bg-neutral-100 p-2 text-neutral-500 hover:bg-neutral-200"
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

function CategoryEditor({
  state,
  roots,
  onClose,
  onSaved,
}: {
  state: EditorState;
  roots: CategoryNode[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const category = state.category;
  const hasChildren = (category?.children.length ?? 0) > 0;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: category?.name ?? '',
    slug: category?.slug ?? '',
    parentId: category?.parentId ?? state.defaultParentId ?? '',
    imageUrl: category?.imageUrl ?? '',
    sortOrder: String(category?.sortOrder ?? 0),
    isVisible: category?.isVisible ?? true,
  });

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        parentId: form.parentId || null,
        imageUrl: form.imageUrl || null,
        sortOrder: Number(form.sortOrder),
        isVisible: form.isVisible,
      };
      await apiRequest(
        category
          ? `/api/admin/categories/${category.id}`
          : '/api/admin/categories',
        {
          method: category ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      onSaved(category ? '分类已更新' : '分类已创建');
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminDrawer
      title={category ? '编辑分类' : '新增分类'}
      description="分类最多支持两级，Slug 将用于前台分类页面地址。"
      onClose={onClose}
      busy={submitting}
    >
      <form onSubmit={submit}>
        <div className="space-y-5 px-5 py-6 sm:px-7">
          <Field label="分类名称">
            <input
              required
              maxLength={50}
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className={inputClass}
              placeholder="桌面摆件"
            />
          </Field>
          <Field
            label="Slug"
            hint="仅支持小写字母、数字和连字符，例如 desk-decor。"
          >
            <input
              required
              maxLength={80}
              value={form.slug}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  slug: event.target.value.toLowerCase(),
                }))
              }
              className={inputClass}
              placeholder="desk-decor"
            />
          </Field>
          <Field
            label="上级分类"
            hint={
              hasChildren
                ? '该分类已有子分类，因此只能保留为一级分类。'
                : '不选择时创建为一级分类。'
            }
          >
            <select
              value={form.parentId}
              disabled={hasChildren}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  parentId: event.target.value,
                }))
              }
              className={`${inputClass} disabled:bg-neutral-100 disabled:text-neutral-400`}
            >
              <option value="">无（一级分类）</option>
              {roots
                .filter((root) => root.id !== category?.id)
                .map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="分类图片 URL" hint="填写可公开访问的分类图片地址。">
            <input
              type="url"
              value={form.imageUrl}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  imageUrl: event.target.value,
                }))
              }
              className={inputClass}
              placeholder="https://..."
            />
          </Field>
          <Field
            label="排序值"
            hint="数值越小越靠前，也可在列表中使用上下箭头快速调整。"
          >
            <input
              required
              type="number"
              min={-999999}
              max={999999}
              value={form.sortOrder}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sortOrder: event.target.value,
                }))
              }
              className={inputClass}
            />
          </Field>
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-black/8 p-4">
            <span>
              <span className="block text-sm font-medium">前台显示</span>
              <span className="mt-1 block text-xs text-neutral-400">
                隐藏后不会出现在前台分类树中
              </span>
            </span>
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  isVisible: event.target.checked,
                }))
              }
              className="size-5 accent-neutral-900"
            />
          </label>
          {error ? (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>
        <div className="admin-save-bar">
          <button
            type="button"
            data-drawer-close
            onClick={onClose}
            className="h-10 rounded-md border border-black/10 bg-white px-4 text-sm font-medium"
          >
            取消
          </button>
          <button
            disabled={submitting}
            className="flex h-10 items-center gap-2 rounded-md bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            {category ? '保存修改' : '创建分类'}
          </button>
        </div>
      </form>
    </AdminDrawer>
  );
}

function DeleteConfirmation({
  category,
  deleting,
  onClose,
  onConfirm,
}: {
  category: CategoryNode;
  deleting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="确认删除分类" onClose={onClose}>
      <div className="px-5 py-6 sm:px-7">
        <div className="flex gap-3 rounded-lg bg-red-50 p-4 text-red-800">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm leading-6">
            <p>
              确定删除 <strong>{category.name}</strong>？
            </p>
            {category.children.length > 0 ? (
              <p className="mt-1">该分类含有子分类，必须先移动或删除子分类。</p>
            ) : category.productCount > 0 ? (
              <p className="mt-1">
                该分类关联 {category.productCount}{' '}
                个商品，删除后商品将变为未分类。
              </p>
            ) : (
              <p className="mt-1">此操作无法撤销。</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-3 border-t border-black/6 bg-neutral-50 px-4 py-3 sm:px-7">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-md border border-black/10 bg-white px-4 text-sm font-medium"
        >
          取消
        </button>
        <button
          type="button"
          disabled={deleting || category.children.length > 0}
          onClick={onConfirm}
          className="flex h-10 items-center gap-2 rounded-md bg-red-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {deleting ? <LoaderCircle className="size-4 animate-spin" /> : null}
          确认删除
        </button>
      </div>
    </Modal>
  );
}

function ActionButton({
  title,
  disabled,
  onClick,
  children,
  danger = false,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs transition disabled:opacity-25 ${
        danger
          ? 'text-neutral-400 hover:bg-red-50 hover:text-red-600'
          : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      {children}
      <span>{title}</span>
    </button>
  );
}

export function CategoriesManager({ canEdit }: { canEdit: boolean }) {
  const [result, setResult] = useState<CategoryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CategoryNode | null>(null);
  const [busyId, setBusyId] = useState('');
  const [keyword, setKeyword] = useAdminQueryState<string>('keyword', '');
  const [collapsed, setCollapsed] = useAdminQueryState<string>('collapsed', '');
  const collapsedIds = new Set(collapsed.split(',').filter(Boolean));
  const [moreTarget, setMoreTarget] = useState<CategoryNode | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setResult(await apiRequest('/api/admin/categories'));
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '分类加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function saved(message: string): void {
    setEditor(null);
    setNotice(message);
    void load();
  }

  async function updateOne(
    category: CategoryNode,
    patch: Record<string, unknown>,
    message: string,
  ): Promise<void> {
    setBusyId(category.id);
    setError('');
    try {
      await apiRequest(`/api/admin/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setNotice(message);
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusyId('');
    }
  }

  async function move(
    category: CategoryNode,
    siblings: CategoryNode[],
    direction: -1 | 1,
  ): Promise<void> {
    const index = siblings.findIndex((item) => item.id === category.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) return;
    const ordered = [...siblings];
    [ordered[index], ordered[targetIndex]] = [
      ordered[targetIndex]!,
      ordered[index]!,
    ];
    setBusyId(category.id);
    setError('');
    try {
      await Promise.all(
        ordered.map((item, order) =>
          apiRequest(`/api/admin/categories/${item.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ sortOrder: order * 10 }),
          }),
        ),
      );
      setNotice('分类顺序已调整');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '排序失败');
      await load();
    } finally {
      setBusyId('');
    }
  }

  async function remove(): Promise<void> {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    setError('');
    try {
      await apiRequest(`/api/admin/categories/${deleteTarget.id}`, {
        method: 'DELETE',
      });
      setDeleteTarget(null);
      setNotice('分类已删除');
      await load();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : '删除失败');
      setDeleteTarget(null);
    } finally {
      setBusyId('');
    }
  }

  const roots = result?.list ?? [];
  const visibleCount = roots.reduce(
    (total, root) =>
      total +
      (root.isVisible ? 1 : 0) +
      root.children.filter((child) => child.isVisible).length,
    0,
  );

  const matches = (category: CategoryNode) =>
    (category.name + ' ' + category.slug)
      .toLowerCase()
      .includes(keyword.trim().toLowerCase());
  const filteredRoots = roots.filter(
    (root) => matches(root) || root.children.some(matches),
  );
  const moreSiblings = moreTarget?.parentId
    ? (roots.find((root) => root.id === moreTarget.parentId)?.children ?? [])
    : roots;
  const moreIndex = moreSiblings.findIndex(
    (item) => item.id === moreTarget?.id,
  );

  function row(category: CategoryNode, level: 1 | 2): ReactNode {
    return (
      <div
        key={category.id}
        className={`grid grid-cols-[minmax(260px,1fr)_130px_120px_260px] items-center border-t border-black/5 px-5 py-3.5 transition hover:bg-neutral-50/70 ${
          !category.isVisible ? 'opacity-55' : ''
        }`}
      >
        <div
          className="flex min-w-0 items-center gap-3"
          style={{ paddingLeft: level === 2 ? 36 : 0 }}
        >
          {level === 1 && category.children.length > 0 ? (
            <button
              type="button"
              aria-label={
                collapsedIds.has(category.id) ? '展开子分类' : '收起子分类'
              }
              aria-expanded={Boolean(keyword) || !collapsedIds.has(category.id)}
              disabled={Boolean(keyword)}
              onClick={() => {
                const next = new Set(collapsedIds);
                if (next.has(category.id)) next.delete(category.id);
                else next.add(category.id);
                setCollapsed([...next].join(','));
              }}
              className="rounded p-1 hover:bg-neutral-100"
            >
              <ChevronRight
                className={
                  (!collapsedIds.has(category.id) || keyword
                    ? 'rotate-90 '
                    : '') + 'size-4 transition'
                }
              />
            </button>
          ) : null}
          {level === 2 ? (
            <span className="-ml-7 flex items-center text-neutral-300">
              <ChevronRight className="size-4" />
            </span>
          ) : null}
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-md ${
              level === 1
                ? 'bg-lime-100 text-lime-800'
                : 'bg-neutral-100 text-neutral-500'
            }`}
          >
            {category.imageUrl ? (
              <ImageIcon className="size-5" />
            ) : level === 1 ? (
              <FolderOpen className="size-5" />
            ) : (
              <Folder className="size-5" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-neutral-900">
              {category.name}
            </p>
            <p className="mt-0.5 truncate font-mono text-xs text-neutral-400">
              /category/{category.slug}
            </p>
          </div>
        </div>
        <div className="text-sm text-neutral-500">
          {level === 1 ? `${category.children.length} 个子分类` : '二级分类'}
        </div>
        <div className="text-sm text-neutral-500">
          {category.productCount} 个商品
        </div>
        <div className="flex justify-end gap-2">
          {canEdit ? (
            <>
              <ActionButton
                title="编辑"
                disabled={busyId !== ''}
                onClick={() =>
                  setEditor({ category, defaultParentId: category.parentId })
                }
              >
                <Pencil className="size-4" />
              </ActionButton>
              {level === 1 ? (
                <ActionButton
                  title="新增子分类"
                  disabled={busyId !== ''}
                  onClick={() =>
                    setEditor({ category: null, defaultParentId: category.id })
                  }
                >
                  <Plus className="size-4" />
                </ActionButton>
              ) : null}
              <ActionButton
                title="更多"
                disabled={busyId !== ''}
                onClick={() => setMoreTarget(category)}
              >
                <MoreHorizontal className="size-4" />
              </ActionButton>
            </>
          ) : (
            <span className="text-xs text-neutral-500">
              {category.isVisible ? '显示中' : '已隐藏'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] rounded-lg bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
            分类管理
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            维护两级商品分类、前台显示状态与展示顺序。
          </p>
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditor({ category: null, defaultParentId: null })}
            className="flex h-11 items-center justify-center gap-2 rounded-md bg-[#151816] px-5 text-sm font-semibold text-white shadow-sm hover:bg-black sm:h-9"
          >
            <Plus className="size-4" />
            新增一级分类
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-neutral-500">
        <span>全部 {result?.total ?? '—'}</span>
        <span>一级 {roots.length}</span>
        <span>显示中 {visibleCount}</span>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-black/6 bg-white shadow-none">
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-3 left-3 size-4 text-neutral-400" />
            <input
              aria-label="搜索分类"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索分类名称或地址"
              className="h-10 w-full rounded-md border border-neutral-200 pr-3 pl-9 text-sm"
            />
          </div>
          <button
            type="button"
            title="刷新"
            onClick={() => void load()}
            className="grid size-10 place-items-center rounded-md border border-black/10 text-neutral-500 hover:bg-neutral-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {error ? (
          <div className="m-4 flex items-center gap-2 rounded-md bg-red-50 p-4 text-sm text-red-700">
            <CircleAlert className="size-4" />
            {error}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(260px,1fr)_130px_120px_260px] bg-neutral-50/70 px-5 py-3 text-xs text-neutral-400">
              <span>分类名称</span>
              <span>层级</span>
              <span>商品</span>
              <span className="text-right">操作</span>
            </div>
            {loading && !result ? (
              <div className="grid h-56 place-items-center text-neutral-400">
                <LoaderCircle className="size-6 animate-spin" />
              </div>
            ) : null}
            {!loading && filteredRoots.length === 0 ? (
              <div className="flex h-60 flex-col items-center justify-center text-neutral-400">
                <Folder className="size-9" />
                <p className="mt-3 text-sm">暂无匹配分类</p>
              </div>
            ) : null}
            {filteredRoots.flatMap((root) => [
              row(root, 1),
              ...(keyword || !collapsedIds.has(root.id)
                ? root.children
                    .filter((child) => matches(root) || matches(child))
                    .map((child) => row(child, 2))
                : []),
            ])}
          </div>
        </div>
      </div>

      {moreTarget ? (
        <Modal
          title={moreTarget.name + ' · 更多操作'}
          onClose={() => setMoreTarget(null)}
        >
          <div className="grid gap-2 p-5">
            <p className="mb-2 text-sm text-neutral-500">
              当前状态：{moreTarget.isVisible ? '前台显示' : '已隐藏'} ·{' '}
              {moreTarget.productCount} 个商品
            </p>
            <ActionButton
              title="同级上移"
              disabled={moreIndex <= 0 || busyId !== ''}
              onClick={() => {
                void move(moreTarget, moreSiblings, -1);
                setMoreTarget(null);
              }}
            >
              <ArrowUp className="size-4" />
            </ActionButton>
            <ActionButton
              title="同级下移"
              disabled={moreIndex >= moreSiblings.length - 1 || busyId !== ''}
              onClick={() => {
                void move(moreTarget, moreSiblings, 1);
                setMoreTarget(null);
              }}
            >
              <ArrowDown className="size-4" />
            </ActionButton>
            <ActionButton
              title={moreTarget.isVisible ? '隐藏分类' : '显示分类'}
              disabled={busyId !== ''}
              onClick={() => {
                void updateOne(
                  moreTarget,
                  { isVisible: !moreTarget.isVisible },
                  '分类显示状态已更新',
                );
                setMoreTarget(null);
              }}
            >
              <Eye className="size-4" />
            </ActionButton>
            <ActionButton
              title="删除分类"
              danger
              disabled={busyId !== ''}
              onClick={() => {
                setDeleteTarget(moreTarget);
                setMoreTarget(null);
              }}
            >
              <Trash2 className="size-4" />
            </ActionButton>
          </div>
        </Modal>
      ) : null}
      {editor ? (
        <CategoryEditor
          state={editor}
          roots={roots}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteConfirmation
          category={deleteTarget}
          deleting={busyId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </div>
  );
}
