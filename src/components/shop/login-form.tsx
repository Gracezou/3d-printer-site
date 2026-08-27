'use client';

import { FormEvent, useState } from 'react';

interface LoginFormProps {
  returnTo: string;
}

interface ApiResult {
  code: number;
  message: string;
}

export function LoginForm({ returnTo }: LoginFormProps) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function sendCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        setMessage(result.message);
        return;
      }
      setCodeSent(true);
      setMessage('验证码已发送');
    } catch {
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok) {
        setMessage(result.message);
        return;
      }
      window.location.assign(returnTo);
    } catch {
      setMessage('网络异常，请稍后再试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-7 shadow-sm">
      <h1 className="text-2xl font-semibold">手机号登录</h1>
      <p className="mt-2 text-sm text-neutral-500">
        登录后可管理购物车、地址和订单。
      </p>

      {!codeSent ? (
        <form className="mt-7 space-y-4" onSubmit={sendCode}>
          <label className="block text-sm font-medium" htmlFor="phone">
            手机号
          </label>
          <input
            id="phone"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="请输入 11 位手机号"
            className="h-11 w-full rounded-lg border border-neutral-300 px-3 outline-none focus:border-neutral-800"
          />
          <button
            disabled={loading}
            className="h-11 w-full rounded-lg bg-neutral-900 font-medium text-white disabled:opacity-50"
          >
            {loading ? '发送中…' : '获取验证码'}
          </button>
        </form>
      ) : (
        <form className="mt-7 space-y-4" onSubmit={verifyCode}>
          <label className="block text-sm font-medium" htmlFor="code">
            短信验证码
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="请输入 6 位验证码"
            className="h-11 w-full rounded-lg border border-neutral-300 px-3 tracking-[0.3em] outline-none focus:border-neutral-800"
          />
          <button
            disabled={loading}
            className="h-11 w-full rounded-lg bg-neutral-900 font-medium text-white disabled:opacity-50"
          >
            {loading ? '登录中…' : '登录'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCodeSent(false);
              setCode('');
              setMessage('');
            }}
            className="w-full text-sm text-neutral-500"
          >
            修改手机号
          </button>
        </form>
      )}

      {message ? (
        <p className="mt-4 text-sm text-neutral-600">{message}</p>
      ) : null}
    </div>
  );
}
