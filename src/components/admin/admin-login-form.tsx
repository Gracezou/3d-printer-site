'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { zhCN } from '@/messages/zh-CN';

interface AdminLoginFormProps {
  returnTo: string;
}

interface ApiResult {
  code: number;
  message: string;
}

export function AdminLoginForm({ returnTo }: AdminLoginFormProps) {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        setMessage(result.message);
        return;
      }
      router.replace(returnTo);
      router.refresh();
    } catch {
      setMessage(zhCN.errors.network);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-950 p-7 text-white shadow-2xl">
      <p className="text-xs font-medium tracking-[0.2em] text-neutral-500">
        ADMIN CONSOLE
      </p>
      <h1 className="mt-3 text-2xl font-semibold">管理后台登录</h1>
      <form className="mt-7 space-y-4" onSubmit={submit}>
        <div>
          <label
            className="mb-2 block text-sm text-neutral-300"
            htmlFor="username"
          >
            用户名
          </label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label
            className="mb-2 block text-sm text-neutral-300"
            htmlFor="password"
          >
            密码
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 outline-none focus:border-neutral-400"
          />
        </div>
        <button
          disabled={loading}
          className="h-11 w-full rounded-lg bg-white font-medium text-neutral-950 disabled:opacity-50"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
      {message ? <p className="mt-4 text-sm text-red-300">{message}</p> : null}
    </div>
  );
}
