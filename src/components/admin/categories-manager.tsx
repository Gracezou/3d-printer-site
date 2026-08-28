'use client';

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleAlert,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
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
    if (response.status === 401) window.location.assign('/admin/login');
    throw new Error(result.message || '请求失败');
  }
  return result.data;
}

const inputClass =
  'h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none transition placeholder:text-neutral-300 focus:border-neutral-500 focus:ring-2 focus:ring-neutral-100';

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
        className="relative max-h-[92vh] w-full max-w-xl overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
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
    <Modal
      title={category ? '编辑分类' : '新增分类'}
      description="分类最多支持两级，Slug 将用于前台分类页面地址。"
      onClose={onClose}
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
          <Field
            label="分类图片 URL"
            hint="图片上传功能将在 T035 接入，目前可填写已有图片地址。"
          >
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
          <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-black/8 p-4">
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
            <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          ) : null}
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
            disabled={submitting}
            className="flex h-10 items-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : null}
            {category ? '保存修改' : '创建分类'}
          </button>
        </div>
      </form>
    </Modal>
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
        <div className="flex gap-3 rounded-2xl bg-red-50 p-4 text-red-800">
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
          disabled={deleting || category.children.length > 0}
          onClick={onConfirm}
          className="flex h-10 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
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
      className={`rounded-lg p-2 transition disabled:opacity-25 ${
        danger
          ? 'text-neutral-400 hover:bg-red-50 hover:text-red-600'
          : 'text-neutral-400 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      {children}
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

  function row(
    category: CategoryNode,
    siblings: CategoryNode[],
    level: 1 | 2,
  ): ReactNode {
    const index = siblings.findIndex((item) => item.id === category.id);
    return (
      <div
        key={category.id}
        className={`grid grid-cols-[minmax(260px,1fr)_130px_120px_160px] items-center border-t border-black/5 px-5 py-3.5 transition hover:bg-neutral-50/70 ${
          !category.isVisible ? 'opacity-55' : ''
        }`}
      >
        <div
          className="flex min-w-0 items-center gap-3"
          style={{ paddingLeft: level === 2 ? 36 : 0 }}
        >
          {level === 2 ? (
            <span className="-ml-7 flex items-center text-neutral-300">
              <ChevronRight className="size-4" />
            </span>
          ) : null}
          <span
            className={`grid size-10 shrink-0 place-items-center rounded-xl ${
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
        <div className="flex justify-end gap-0.5">
          {canEdit ? (
            <>
              <ActionButton
                title="上移"
                disabled={index === 0 || busyId !== ''}
                onClick={() => void move(category, siblings, -1)}
              >
                <ArrowUp className="size-4" />
              </ActionButton>
              <ActionButton
                title="下移"
                disabled={index === siblings.length - 1 || busyId !== ''}
                onClick={() => void move(category, siblings, 1)}
              >
                <ArrowDown className="size-4" />
              </ActionButton>
              <ActionButton
                title={category.isVisible ? '隐藏' : '显示'}
                disabled={busyId !== ''}
                onClick={() =>
                  void updateOne(
                    category,
                    { isVisible: !category.isVisible },
                    category.isVisible ? '分类已隐藏' : '分类已显示',
                  )
                }
              >
                {category.isVisible ? (
                  <Eye className="size-4" />
                ) : (
                  <EyeOff className="size-4" />
                )}
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
                title="编辑"
                disabled={busyId !== ''}
                onClick={() =>
                  setEditor({ category, defaultParentId: category.parentId })
                }
              >
                <Pencil className="size-4" />
              </ActionButton>
              <ActionButton
                title="删除"
                disabled={busyId !== ''}
                danger
                onClick={() => setDeleteTarget(category)}
              >
                <Trash2 className="size-4" />
              </ActionButton>
            </>
          ) : (
            <span className="text-xs text-neutral-400">
              {category.isVisible ? '显示中' : '已隐藏'}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
      {notice ? (
        <div className="fixed top-5 right-5 z-[90] rounded-2xl bg-[#151816] px-5 py-3 text-sm font-medium text-white shadow-xl">
          {notice}
        </div>
      ) : null}
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            CATALOG
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
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
            className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#151816] px-5 text-sm font-semibold text-white shadow-sm hover:bg-black"
          >
            <Plus className="size-4" />
            新增一级分类
          </button>
        ) : null}
      </div>

      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">全部分类</p>
          <p className="mt-1 text-2xl font-semibold">{result?.total ?? '—'}</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">一级分类</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading ? '—' : roots.length}
          </p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-4">
          <p className="text-xs text-neutral-400">前台显示</p>
          <p className="mt-1 text-2xl font-semibold">
            {loading ? '—' : visibleCount}
          </p>
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-black/6 bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]">
        <div className="flex items-center justify-between border-b border-black/6 px-5 py-4">
          <div>
            <h2 className="font-semibold">分类树</h2>
            <p className="mt-1 text-xs text-neutral-400">
              上下箭头仅调整同级分类顺序
            </p>
          </div>
          <button
            type="button"
            title="刷新"
            onClick={() => void load()}
            className="grid size-10 place-items-center rounded-xl border border-black/10 text-neutral-500 hover:bg-neutral-50"
          >
            <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {error ? (
          <div className="m-4 flex items-center gap-2 rounded-xl bg-red-50 p-4 text-sm text-red-700">
            <CircleAlert className="size-4" />
            {error}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <div className="min-w-[760px]">
            <div className="grid grid-cols-[minmax(260px,1fr)_130px_120px_160px] bg-neutral-50/70 px-5 py-3 text-xs text-neutral-400">
              <span>分类名称</span>
              <span>层级</span>
              <span>商品</span>
              <span className="text-right">操作</span>
            </div>
            {loading ? (
              <div className="grid h-56 place-items-center text-neutral-400">
                <LoaderCircle className="size-6 animate-spin" />
              </div>
            ) : null}
            {!loading && roots.length === 0 ? (
              <div className="flex h-60 flex-col items-center justify-center text-neutral-400">
                <Folder className="size-9" />
                <p className="mt-3 text-sm">暂无分类，请先创建一级分类</p>
              </div>
            ) : null}
            {!loading
              ? roots.flatMap((root) => [
                  row(root, roots, 1),
                  ...root.children.map((child) => row(child, root.children, 2)),
                ])
              : null}
          </div>
        </div>
      </div>

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
