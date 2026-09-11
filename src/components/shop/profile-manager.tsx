'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Profile {
  userId: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  nickname: string | null;
}

interface ApiEnvelope {
  code: number;
  data: Profile | null;
  message: string;
}

export function ProfileManager() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (response.status === 401) {
          router.replace('/auth/login?next=%2Faccount%2Fprofile');
          return;
        }
        const body = (await response.json()) as ApiEnvelope;
        if (!response.ok || !body.data) throw new Error(body.message);
        setProfile(body.data);
        setNickname(body.data.nickname ?? '');
        setPhone(body.data.phone ?? '');
      } catch (error: unknown) {
        setMessage(error instanceof Error ? error.message : '资料加载失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, phone }),
      });
      const body = (await response.json()) as ApiEnvelope;
      if (!response.ok || !body.data) throw new Error(body.message);
      setProfile(body.data);
      setNickname(body.data.nickname ?? '');
      setPhone(body.data.phone ?? '');
      setMessage('个人资料已保存');
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : '资料保存失败');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">正在加载资料…</p>;
  if (!profile) return <p className="text-sm text-red-700">{message}</p>;

  return (
    <form
      onSubmit={submit}
      className="max-w-xl space-y-6 rounded-3xl border border-stone-900/8 bg-white/70 p-6 sm:p-8"
    >
      <label className="block">
        <span className="text-sm font-medium">登录邮箱</span>
        <input
          readOnly
          value={profile.email}
          className="mt-2 h-11 w-full rounded-xl border border-stone-900/8 bg-stone-100 px-3 text-sm text-stone-500"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">昵称</span>
        <input
          maxLength={50}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          className="mt-2 h-11 w-full rounded-xl border border-stone-900/12 bg-white px-3 outline-none focus:border-stone-900/30"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">默认联系电话</span>
        <input
          inputMode="tel"
          autoComplete="tel"
          pattern="1[3-9][0-9]{9}"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="用于新建收货地址时自动填写"
          className="mt-2 h-11 w-full rounded-xl border border-stone-900/12 bg-white px-3 outline-none focus:border-stone-900/30"
        />
        <span className="mt-2 block text-xs leading-5 text-stone-500">
          当前仅作为订单联系电话，不用于登录或找回账号，也不代表号码已验证。
        </span>
      </label>
      <button
        disabled={saving}
        className="bg-store-ink h-11 rounded-full px-6 text-sm font-bold text-white disabled:opacity-50"
      >
        {saving ? '保存中…' : '保存资料'}
      </button>
      {message ? <p className="text-sm text-stone-600">{message}</p> : null}
    </form>
  );
}
