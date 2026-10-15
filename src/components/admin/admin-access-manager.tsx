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

import { useAdminQueryState } from '@/lib/use-admin-query-state';

import { useUnsavedChanges } from '@/lib/use-unsaved-changes';
import { AdminDrawer } from '@/components/admin/admin-drawer';

import { notifyAdminUnauthorized } from '@/lib/admin-session-client';

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
      'return:review',
    ],
  ],
  ['生产', ['production:view', 'production:update']],
  ['商品', ['product:view', 'product:edit', 'product:publish']],
  ['分类', ['category:view', 'category:edit']],
  ['机型', ['device:manage']],
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
  'return:review': '查看/驳回售后（批准还需退款权限）',
  'production:view': '查看生产',
  'production:update': '更新生产',
  'product:view': '查看商品',
  'product:edit': '编辑商品',
  'product:publish': '上下架',
  'category:view': '查看分类',
  'category:edit': '编辑分类',
  'device:manage': '管理设备与机型',
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
    notifyAdminUnauthorized();
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
  const [tab, setTab] = useAdminQueryState<'admins' | 'roles'>('tab', 'admins');
  const [admins, setAdmins] = useState<ListResult | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [keyword, setKeyword] = useAdminQueryState<string>('keyword', '');
  const [keywordInput, setKeywordInput] = useState(keyword);
  useEffect(() => setKeywordInput(keyword), [keyword]);
  const [status, setStatus] = useAdminQueryState<string>('status', '');
  const [page, setPage] = useAdminQueryState<number>('page', 1);
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
  const [roleBaseline, setRoleBaseline] = useState('');
  const roleDirty =
    Boolean(roleEditor) && JSON.stringify(roleForm) !== roleBaseline;
  const confirmRoleDiscard = useUnsavedChanges(roleDirty);

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
    if (busy || !confirmRoleDiscard()) return;
    const draft =
      target === 'new'
        ? { code: '', name: '', permissions: [] }
        : {
            code: target.code,
            name: target.name,
            permissions: target.permissions.includes('*')
              ? []
              : target.permissions,
          };
    setRoleBaseline(JSON.stringify(draft));
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
    if (
      !isNew &&
      !isSuper &&
      !window.confirm(
        '权限变更会立即影响该角色下 ' +
          roleEditor.adminCount +
          ' 个账号，确认保存？',
      )
    ) {
      setBusy('');
      return;
    }
    try {
      const savedRole = await apiRequest<Role>(
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
      setRoleEditor({
        ...savedRole,
        adminCount: isNew ? 0 : roleEditor.adminCount,
      });
      setRoleBaseline(JSON.stringify(roleForm));
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
      if (roleEditor !== 'new' && roleEditor?.id === target.id)
        setRoleEditor(null);
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

  const rolePanel = roleEditor ? (
    <section className="min-w-0 rounded-lg border border-neutral-200 bg-white">
      <form onSubmit={(event) => void saveRole(event)} className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              {roleEditor === 'new' ? '新增角色' : '编辑角色'}
            </h2>
            <p className="text-xs text-zinc-400">
              权限变更会在管理员下一次请求时即时生效。
            </p>
          </div>
          <span className="text-xs text-neutral-500">
            {roleForm.permissions.length} 项已选
          </span>
        </div>
        <fieldset
          disabled={!canEditRoles || Boolean(busy)}
          className="mt-4 grid gap-4 sm:grid-cols-2"
        >
          <label className="text-sm">
            角色编码
            <input
              required
              disabled={roleEditor !== 'new'}
              value={roleForm.code}
              onChange={(event) =>
                setRoleForm({ ...roleForm, code: event.target.value })
              }
              className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2 disabled:bg-zinc-50"
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
              className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
            />
          </label>
        </fieldset>
        {roleEditor !== 'new' && roleEditor.code === 'super_admin' ? (
          <div className="mt-5 rounded-md bg-lime-50 p-4 text-sm text-lime-800">
            超级管理员固定拥有全部权限，不能取消。
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {permissionGroups.map(([group, permissions]) => (
              <fieldset
                key={group}
                disabled={!canEditRoles || Boolean(busy)}
                className="border-t border-neutral-100 pt-3"
              >
                <legend className="mb-2 text-sm font-semibold text-zinc-700">
                  {group}{' '}
                  <span className="ml-2 font-normal text-neutral-500">
                    {
                      permissions.filter((p) =>
                        roleForm.permissions.includes(p),
                      ).length
                    }
                    /{permissions.length}
                  </span>
                  <label className="ml-4 inline-flex items-center gap-1.5 font-normal">
                    <input
                      type="checkbox"
                      aria-label={group + '全选'}
                      disabled={!canEditRoles || Boolean(busy)}
                      checked={permissions.every((p) =>
                        roleForm.permissions.includes(p),
                      )}
                      ref={(element) => {
                        if (element)
                          element.indeterminate =
                            permissions.some((p) =>
                              roleForm.permissions.includes(p),
                            ) &&
                            !permissions.every((p) =>
                              roleForm.permissions.includes(p),
                            );
                      }}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setRoleForm((current) => ({
                          ...current,
                          permissions: checked
                            ? [
                                ...new Set([
                                  ...current.permissions,
                                  ...permissions,
                                ]),
                              ]
                            : current.permissions.filter(
                                (p) =>
                                  !(permissions as readonly string[]).includes(
                                    p,
                                  ),
                              ),
                        }));
                      }}
                    />
                    全选
                  </label>
                </legend>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {permissions.map((permission) => (
                    <label
                      key={permission}
                      className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        checked={roleForm.permissions.includes(permission)}
                        onChange={() => togglePermission(permission)}
                        className="accent-zinc-900"
                      />
                      <span>{permissionLabels[permission]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        {error ? (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {canEditRoles ? (
          <div className="admin-save-bar mt-4">
            <button
              type="button"
              onClick={() => {
                if (!busy && confirmRoleDiscard()) setRoleEditor(null);
              }}
              className="rounded-md border px-4 py-2 text-sm"
            >
              取消
            </button>
            <button
              disabled={Boolean(busy) || !roleDirty}
              className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {busy === 'role-save' ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              保存
            </button>
          </div>
        ) : null}
      </form>
    </section>
  ) : (
    <div className="rounded-lg border border-neutral-200 bg-white p-8 text-sm text-neutral-500">
      选择左侧角色查看权限，或新增角色。
    </div>
  );

  const totalPages = Math.max(
    1,
    Math.ceil((admins?.total ?? 0) / (admins?.pageSize ?? 20)),
  );

  return (
    <div className="admin-page space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">管理员与角色</h1>
          <p className="mt-1 text-sm text-zinc-500">
            管理后台账号、角色和模块级操作权限。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!busy && confirmRoleDiscard()) {
              setRoleEditor(null);
              void load();
            }
          }}
          className="flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium hover:bg-zinc-50"
        >
          <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-800">
          {notice}
        </div>
      ) : null}

      <div className="flex gap-2 rounded-lg border border-zinc-200 bg-white p-2">
        <button
          type="button"
          onClick={() => {
            if (!busy && confirmRoleDiscard()) {
              setRoleEditor(null);
              setTab('admins');
            }
          }}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${tab === 'admins' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
        >
          <UserCog className="size-4" />
          管理员账号
        </button>
        <button
          type="button"
          onClick={() => setTab('roles')}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium ${tab === 'roles' ? 'bg-zinc-900 text-white' : 'text-zinc-500 hover:bg-zinc-50'}`}
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
                  className="w-full rounded-md border border-zinc-200 bg-white py-2 pr-3 pl-9 text-sm"
                />
              </div>
              <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white">
                搜索
              </button>
            </form>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
              className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
            {canEditAdmins ? (
              <button
                type="button"
                onClick={() => openAdminEditor('new')}
                className="flex items-center gap-2 rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                <Plus className="size-4" />
                新增管理员
              </button>
            ) : null}
          </div>
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
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
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3">
                        <p>{account.roleName}</p>
                        <p className="text-xs text-zinc-400">
                          {account.roleCode}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${account.status === 'active' ? 'bg-lime-100 text-lime-800' : 'bg-zinc-100 text-zinc-500'}`}
                        >
                          {account.status === 'active' ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-500">
                        {formatTime(account.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {canEditAdmins ? (
                            <>
                              <button
                                title="编辑"
                                onClick={() => openAdminEditor(account)}
                                className="inline-flex items-center gap-1 rounded-md p-2 text-xs text-zinc-600 hover:bg-zinc-100"
                              >
                                <Pencil className="size-4" /> 编辑
                              </button>
                              <button
                                title="重置密码"
                                onClick={() => {
                                  setResetTarget(account);
                                  setNewPassword('');
                                  setError('');
                                }}
                                className="inline-flex items-center gap-1 rounded-md p-2 text-xs text-zinc-600 hover:bg-zinc-100"
                              >
                                <KeyRound className="size-4" /> 重置密码
                              </button>
                              {account.id !== currentAdminId ? (
                                <button
                                  title="删除"
                                  disabled={busy === account.id}
                                  onClick={() => void removeAdmin(account)}
                                  className="inline-flex items-center gap-1 rounded-md p-2 text-xs text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="size-4" /> 删除
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
        <section className="admin-split">
          <nav
            aria-label="角色列表"
            className="space-y-1 rounded-lg border border-neutral-200 bg-white p-2"
          >
            {canEditRoles ? (
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => openRoleEditor('new')}
                className="mb-2 flex w-full items-center gap-2 rounded-md border border-neutral-200 px-3 py-2 text-sm"
              >
                <Plus className="size-4" />
                新增角色
              </button>
            ) : null}
            {roles.map((role) => (
              <div key={role.id} className="flex items-center">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  aria-pressed={
                    roleEditor !== 'new' && roleEditor?.id === role.id
                  }
                  onClick={() => openRoleEditor(role)}
                  className={
                    (roleEditor !== 'new' && roleEditor?.id === role.id
                      ? 'bg-neutral-100 '
                      : 'hover:bg-neutral-50 ') +
                    'min-w-0 flex-1 rounded-md px-3 py-3 text-left'
                  }
                >
                  <span className="block truncate text-sm font-medium">
                    {role.name}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {role.adminCount} 个账号 ·{' '}
                    {role.isSystem ? '系统角色' : '自定义'}
                  </span>
                </button>
                {canEditRoles && !role.isSystem ? (
                  <button
                    type="button"
                    title={
                      role.adminCount ? '请先移出该角色的管理员' : '删除角色'
                    }
                    aria-label={'删除角色 ' + role.name}
                    disabled={role.adminCount > 0 || Boolean(busy)}
                    onClick={() => {
                      if (confirmRoleDiscard()) void removeRole(role);
                    }}
                    className="rounded p-2 text-red-600 disabled:opacity-30"
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
            ))}
            {!roles.length && !loading ? (
              <p className="p-3 text-sm text-neutral-500">暂无角色</p>
            ) : null}
          </nav>
          {rolePanel}
        </section>
      )}

      {adminEditor ? (
        <AdminDrawer
          title={adminEditor === 'new' ? '新增管理员' : '编辑管理员'}
          busy={busy === 'admin-save'}
          onClose={() => setAdminEditor(null)}
        >
          <form onSubmit={(event) => void saveAdmin(event)} className="p-5">
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
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
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
                    className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
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
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
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
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
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
                  className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
                >
                  <option value="active">启用</option>
                  <option value="disabled">停用</option>
                </select>
              </label>
            </div>
            {error ? (
              <p role="alert" className="mt-4 text-sm text-red-700">
                {error}
              </p>
            ) : null}
            <div className="admin-save-bar mt-4">
              <button
                type="button"
                data-drawer-close
                onClick={() => setAdminEditor(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                disabled={busy === 'admin-save'}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
              >
                {busy === 'admin-save' ? '保存中…' : '保存'}
              </button>
            </div>
          </form>
        </AdminDrawer>
      ) : null}

      {resetTarget ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4">
          <form
            onSubmit={(event) => void resetPassword(event)}
            className="w-full max-w-md rounded-lg bg-white p-6"
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
                className="mt-1 w-full rounded-md border border-zinc-200 px-3 py-2"
              />
              <span className="mt-1 block text-xs text-zinc-400">
                至少 8 个字符；密码不会写入日志或接口响应。
              </span>
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="rounded-md border px-4 py-2 text-sm"
              >
                取消
              </button>
              <button
                disabled={busy === 'password'}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm text-white"
              >
                确认重置
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
