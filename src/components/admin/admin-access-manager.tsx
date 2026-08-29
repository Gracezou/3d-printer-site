'use client';

import {
  KeyRound,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';

type Status = 'active' | 'disabled';

interface AdminAccount {
  id: string;
  username: string;
  name: string;
  status: Status;
  roleId: string;
  roleCode: string;
  roleName: string;
  lastLoginAt: string | null;
  createdAt: string;
}

interface Role {
  id: string;
  code: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  adminCount: number;
}

interface ListResult {
  list: AdminAccount[];
  total: number;
  page: number;
  pageSize: number;
}

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

const permissionGroups = [
  ['工作台', ['dashboard:view']],
  [
    '订单',
    [
      'order:view',
      'order:ship',
      'order:cancel',
      'order:refund',
      'order:remark',
      'order:export',
    ],
  ],
  ['生产', ['production:view', 'production:update']],
  ['商品', ['product:view', 'product:edit', 'product:publish']],
  ['分类', ['category:view', 'category:edit']],
  [
    '耗材',
    ['material:view', 'material:edit', 'material:stock_in', 'material:adjust'],
  ],
  ['用户', ['user:view', 'user:disable']],
  ['优惠', ['promotion:view', 'promotion:edit']],
  ['管理员', ['admin:view', 'admin:edit', 'role:edit']],
  ['设置', ['settings:edit']],
] as const;

const permissionLabels: Record<string, string> = {
  'dashboard:view': '查看工作台',
  'order:view': '查看订单',
  'order:ship': '发货',
  'order:cancel': '取消订单',
  'order:refund': '退款',
  'order:remark': '订单备注',
  'order:export': '导出订单',
  'production:view': '查看生产',
  'production:update': '更新生产',
  'product:view': '查看商品',
  'product:edit': '编辑商品',
  'product:publish': '上下架',
  'category:view': '查看分类',
  'category:edit': '编辑分类',
  'material:view': '查看耗材',
  'material:edit': '编辑耗材',
  'material:stock_in': '耗材入库',
  'material:adjust': '调整库存',
  'user:view': '查看用户',
  'user:disable': '停用用户',
  'promotion:view': '查看优惠',
  'promotion:edit': '编辑优惠',
  'admin:view': '查看管理员',
  'admin:edit': '编辑管理员',
  'role:edit': '编辑角色',
  'settings:edit': '站点设置',
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
  if (!response.ok || result.data === null)
    throw new Error(result.message || '请求失败');
  return result.data;
}

function formatTime(value: string | null): string {
  return value
    ? new Date(value).toLocaleString('zh-CN', { hour12: false })
    : '从未登录';
}

interface Props {
  currentAdminId: string;
  canEditAdmins: boolean;
  canEditRoles: boolean;
}

export function AdminAccessManager({
  currentAdminId,
  canEditAdmins,
  canEditRoles,
}: Props) {
  const [tab, setTab] = useState<'admins' | 'roles'>('admins');
  const [admins, setAdmins] = useState<ListResult | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [adminEditor, setAdminEditor] = useState<AdminAccount | 'new' | null>(
    null,
  );
  const [roleEditor, setRoleEditor] = useState<Role | 'new' | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
  const [adminForm, setAdminForm] = useState({
    username: '',
    password: '',
    name: '',
    roleId: '',
    status: 'active' as Status,
  });
  const [roleForm, setRoleForm] = useState({
    code: '',
    name: '',
    permissions: [] as string[],
  });
  const [newPassword, setNewPassword] = useState('');

  const loadRoles = useCallback(async () => {
    const data = await apiRequest<Role[]>('/api/admin/roles');
    setRoles(data);
    return data;
  }, []);

  const loadAdmins = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: '20' });
    if (keyword) params.set('keyword', keyword);
    if (status) params.set('status', status);
    setAdmins(await apiRequest<ListResult>(`/api/admin/admins?${params}`));
  }, [keyword, page, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadAdmins(), loadRoles()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '权限数据加载失败');
    } finally {
      setLoading(false);
    }
  }, [loadAdmins, loadRoles]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function openAdminEditor(target: AdminAccount | 'new') {
    setAdminEditor(target);
    setAdminForm(
      target === 'new'
        ? {
            username: '',
            password: '',
            name: '',
            roleId: roles[0]?.id ?? '',
            status: 'active',
          }
        : {
            username: target.username,
            password: '',
            name: target.name,
            roleId: target.roleId,
            status: target.status,
          },
    );
    setError('');
  }

  function openRoleEditor(target: Role | 'new') {
    setRoleEditor(target);
    setRoleForm(
      target === 'new'
        ? { code: '', name: '', permissions: [] }
        : {
            code: target.code,
            name: target.name,
            permissions: target.permissions.includes('*')
              ? []
              : target.permissions,
          },
    );
    setError('');
  }

  async function saveAdmin(event: FormEvent) {
    event.preventDefault();
    if (!adminEditor) return;
    const isNew = adminEditor === 'new';
    setBusy('admin-save');
    setError('');
    try {
      await apiRequest(
        isNew ? '/api/admin/admins' : `/api/admin/admins/${adminEditor.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          body: JSON.stringify(
            isNew
              ? adminForm
              : {
                  username: adminForm.username,
                  name: adminForm.name,
                  roleId: adminForm.roleId,
                  status: adminForm.status,
                },
          ),
        },
      );
      setAdminEditor(null);
      setNotice(isNew ? '管理员已创建' : '管理员已更新');
      await Promise.all([loadAdmins(), loadRoles()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setBusy('');
    }
  }

  async function removeAdmin(target: AdminAccount) {
    if (
      !window.confirm(`确认删除管理员“${target.name}（${target.username}）”？`)
    )
      return;
    setBusy(target.id);
    setError('');
    try {
      await apiRequest(`/api/admin/admins/${target.id}`, { method: 'DELETE' });
      setNotice('管理员已删除');
      await Promise.all([loadAdmins(), loadRoles()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setBusy('');
    }
  }

  async function resetPassword(event: FormEvent) {
    event.preventDefault();
    if (!resetTarget) return;
    setBusy('password');
    setError('');
    try {
      await apiRequest(`/api/admin/admins/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newPassword }),
      });
      setResetTarget(null);
      setNewPassword('');
      setNotice('密码已重置');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '密码重置失败');
    } finally {
      setBusy('');
    }
  }

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    if (!roleEditor) return;
    const isNew = roleEditor === 'new';
    setBusy('role-save');
    setError('');
    const isSuper = !isNew && roleEditor.code === 'super_admin';
    try {
      await apiRequest(
        isNew ? '/api/admin/roles' : `/api/admin/roles/${roleEditor.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          body: JSON.stringify(
            isNew
              ? roleForm
              : isSuper
                ? { name: roleForm.name }
                : { name: roleForm.name, permissions: roleForm.permissions },
          ),
        },
      );
      setRoleEditor(null);
      setNotice(isNew ? '角色已创建' : '角色已更新');
      await Promise.all([loadRoles(), loadAdmins()]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '角色保存失败');
    } finally {
      setBusy('');
    }
  }

  async function removeRole(target: Role) {
    if (!window.confirm(`确认删除角色“${target.name}”？`)) return;
    setBusy(target.id);
    setError('');
    try {
      await apiRequest(`/api/admin/roles/${target.id}`, { method: 'DELETE' });
      setNotice('角色已删除');
      await loadRoles();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '删除失败');
    } finally {
      setBusy('');
    }
  }

  function togglePermission(permission: string) {
    setRoleForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission],
    }));
  }

  const totalPages = Math.max(
    1,
    Math.ceil((admins?.total ?? 0) / (admins?.pageSize ?? 20)),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-lime-700">
            ACCESS CONTROL
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">
            管理员与角色
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            管理后台账号、角色和模块级操作权限。
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
          onClick={() => setTab('admins')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === 'admins' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <UserCog className="size-4" />
          管理员账号
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${tab === 'roles' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <ShieldCheck className="size-4" />
          角色权限
        </button>
      </div>

      {tab === 'admins' ? (
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setKeyword(keywordInput.trim());
              }}
              className="flex min-w-64 flex-1 gap-2"
            >
              <div className="relative flex-1">
                <Search className="absolute top-2.5 left-3 size-4 text-zinc-400" />
                <input
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder="搜索用户名或姓名"
                  className="w-full rounded-xl border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm"
                />
              </div>
              <button className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white">
                搜索
              </button>
            </form>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
            {canEditAdmins ? (
              <button
                type="button"
                onClick={() => openAdminEditor('new')}
                className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2 text-sm font-semibold text-zinc-900"
              >
                <Plus className="size-4" />
                新增管理员
              </button>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-50 text-xs text-zinc-500">
                  <tr>
                    <th className="px-5 py-3">管理员</th>
                    <th className="px-5 py-3">角色</th>
                    <th className="px-5 py-3">状态</th>
                    <th className="px-5 py-3">最后登录</th>
                    <th className="px-5 py-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {admins?.list.map((account) => (
                    <tr key={account.id}>
                      <td className="px-5 py-4">
                        <p className="font-medium text-zinc-900">
                          {account.name}
                          {account.id === currentAdminId ? (
                            <span className="ml-2 text-xs text-lime-700">
                              当前账号
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-zinc-500">
                          {account.username}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p>{account.roleName}</p>
                        <p className="text-xs text-zinc-400">
                          {account.roleCode}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.status === 'active' ? 'bg-lime-100 text-lime-800' : 'bg-zinc-100 text-zinc-500'}`}
                        >
                          {account.status === 'active' ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-zinc-500">
                        {formatTime(account.lastLoginAt)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-end gap-1">
                          {canEditAdmins ? (
                            <>
                              <button
                                title="编辑"
                                onClick={() => openAdminEditor(account)}
                                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                title="重置密码"
                                onClick={() => {
                                  setResetTarget(account);
                                  setNewPassword('');
                                  setError('');
                                }}
                                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
                              >
                                <KeyRound className="size-4" />
                              </button>
                              {account.id !== currentAdminId ? (
                                <button
                                  title="删除"
                                  disabled={busy === account.id}
                                  onClick={() => void removeAdmin(account)}
                                  className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                                >
                                  <Trash2 className="size-4" />
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loading && !admins?.list.length ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-5 py-12 text-center text-zinc-400"
                      >
                        暂无管理员
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-zinc-100 px-5 py-3 text-sm text-zinc-500">
              <span>共 {admins?.total ?? 0} 个账号</span>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((value) => value - 1)}
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-30"
                >
                  上一页
                </button>
                <span>
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((value) => value + 1)}
                  className="rounded-lg border px-3 py-1.5 disabled:opacity-30"
                >
                  下一页
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex justify-end">
            {canEditRoles ? (
              <button
                type="button"
                onClick={() => openRoleEditor('new')}
                className="flex items-center gap-2 rounded-xl bg-lime-300 px-4 py-2 text-sm font-semibold"
              >
                <Plus className="size-4" />
                新增角色
              </button>
            ) : null}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {roles.map((role) => (
              <article
                key={role.id}
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-zinc-900">
                        {role.name}
                      </h2>
                      {role.isSystem ? (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
                          系统角色
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-zinc-400">
                      {role.code} · {role.adminCount} 个账号
                    </p>
                  </div>
                  {canEditRoles ? (
                    <div className="flex">
                      <button
                        title="编辑"
                        onClick={() => openRoleEditor(role)}
                        className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
                      >
                        <Pencil className="size-4" />
                      </button>
                      {!role.isSystem ? (
                        <button
                          title="删除"
                          disabled={role.adminCount > 0 || busy === role.id}
                          onClick={() => void removeRole(role)}
                          className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {role.permissions.includes('*') ? (
                    <span className="rounded-lg bg-lime-100 px-2 py-1 text-xs text-lime-800">
                      全部权限
                    </span>
                  ) : (
                    role.permissions.map((permission) => (
                      <span
                        key={permission}
                        className="rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-600"
                      >
                        {permissionLabels[permission] ?? permission}
                      </span>
                    ))
                  )}
                  {!role.permissions.length ? (
                    <span className="text-xs text-zinc-400">未配置权限</span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {adminEditor ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void saveAdmin(event)}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                {adminEditor === 'new' ? '新增管理员' : '编辑管理员'}
              </h2>
              <button type="button" onClick={() => setAdminEditor(null)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <label className="text-sm">
                用户名
                <input
                  required
                  minLength={3}
                  value={adminForm.username}
                  onChange={(event) =>
                    setAdminForm({ ...adminForm, username: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
              {adminEditor === 'new' ? (
                <label className="text-sm">
                  初始密码
                  <input
                    required
                    type="password"
                    minLength={8}
                    maxLength={72}
                    autoComplete="new-password"
                    value={adminForm.password}
                    onChange={(event) =>
                      setAdminForm({
                        ...adminForm,
                        password: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  />
                  <span className="mt-1 block text-xs text-zinc-400">
                    至少 8 个字符，保存后不会再次展示。
                  </span>
                </label>
              ) : null}
              <label className="text-sm">
                姓名
                <input
                  required
                  value={adminForm.name}
                  onChange={(event) =>
                    setAdminForm({ ...adminForm, name: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
              <label className="text-sm">
                角色
                <select
                  required
                  value={adminForm.roleId}
                  onChange={(event) =>
                    setAdminForm({ ...adminForm, roleId: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}（{role.code}）
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                状态
                <select
                  value={adminForm.status}
                  onChange={(event) =>
                    setAdminForm({
                      ...adminForm,
                      status: event.target.value as Status,
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAdminEditor(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                disabled={busy === 'admin-save'}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {busy === 'admin-save' ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {resetTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void resetPassword(event)}
            className="w-full max-w-md rounded-2xl bg-white p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                重置 {resetTarget.name} 的密码
              </h2>
              <button type="button" onClick={() => setResetTarget(null)}>
                <X className="size-5" />
              </button>
            </div>
            <label className="mt-5 block text-sm">
              新密码
              <input
                required
                type="password"
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-zinc-400">
                至少 8 个字符；密码不会写入日志或接口响应。
              </span>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                disabled={busy === 'password'}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white"
              >
                确认重置
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {roleEditor ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-4">
          <form
            onSubmit={(event) => void saveRole(event)}
            className="mx-auto my-8 w-full max-w-3xl rounded-2xl bg-white p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">
                  {roleEditor === 'new' ? '新增角色' : '编辑角色'}
                </h2>
                <p className="text-xs text-zinc-400">
                  权限变更会在管理员下一次请求时即时生效。
                </p>
              </div>
              <button type="button" onClick={() => setRoleEditor(null)}>
                <X className="size-5" />
              </button>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm">
                角色编码
                <input
                  required
                  disabled={roleEditor !== 'new'}
                  value={roleForm.code}
                  onChange={(event) =>
                    setRoleForm({ ...roleForm, code: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 disabled:bg-zinc-50"
                />
              </label>
              <label className="text-sm">
                角色名称
                <input
                  required
                  value={roleForm.name}
                  onChange={(event) =>
                    setRoleForm({ ...roleForm, name: event.target.value })
                  }
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                />
              </label>
            </div>
            {roleEditor !== 'new' && roleEditor.code === 'super_admin' ? (
              <div className="mt-5 rounded-xl bg-lime-50 p-4 text-sm text-lime-800">
                超级管理员固定拥有全部权限，不能取消。
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                {permissionGroups.map(([group, permissions]) => (
                  <fieldset key={group}>
                    <legend className="mb-2 text-sm font-semibold text-zinc-700">
                      {group}
                    </legend>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {permissions.map((permission) => (
                        <label
                          key={permission}
                          className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                        >
                          <input
                            type="checkbox"
                            checked={roleForm.permissions.includes(permission)}
                            onChange={() => togglePermission(permission)}
                            className="accent-zinc-900"
                          />
                          <span>{permissionLabels[permission]}</span>
                          <code className="ml-auto text-[10px] text-zinc-400">
                            {permission}
                          </code>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRoleEditor(null)}
                className="rounded-xl border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                disabled={busy === 'role-save'}
                className="flex items-center gap-2 rounded-xl bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {busy === 'role-save' ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : null}
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
