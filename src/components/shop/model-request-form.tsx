'use client';

import { CheckCircle2, LoaderCircle, Mail, Users } from 'lucide-react';
import { useState, type FormEvent } from 'react';

interface ApiEnvelope<T> {
  code: number;
  data: T | null;
  message: string;
}

interface ModelRequestFormProps {
  deviceModelId: string;
  deviceName: string;
  initialRequestCount: number;
}

function requestErrorMessage(status: number, message: string): string {
  if (status === 409) return '这个邮箱已经登记过该机型，无需重复提交。';
  if (status === 429) return '登记过于频繁，请稍后再试。';
  return message || '登记失败，请稍后再试。';
}

export function ModelRequestForm({
  deviceModelId,
  deviceName,
  initialRequestCount,
}: ModelRequestFormProps) {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [requestCount, setRequestCount] = useState(initialRequestCount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/model-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceModelId, email, note: note || undefined }),
      });
      const result = (await response.json()) as ApiEnvelope<{
        id: string;
        requestCount: number;
      }>;
      if (!response.ok || !result.data) {
        throw new Error(requestErrorMessage(response.status, result.message));
      }
      setRequestCount(result.data.requestCount);
      setSubmitted(true);
    } catch (caught: unknown) {
      setError(
        caught instanceof Error ? caught.message : '登记失败，请稍后再试。',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="model-request-title"
      className="rounded-store-xl bg-store-ink overflow-hidden text-white"
    >
      <div className="grid gap-8 px-6 py-8 sm:px-9 sm:py-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <span className="bg-store-accent text-store-ink inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold">
            <Users className="size-3.5" /> {requestCount} 人已登记
          </span>
          <h2
            id="model-request-title"
            className="mt-5 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl"
          >
            想要 {deviceName} 的保护壳？
          </h2>
          <p className="mt-3 text-sm leading-7 text-white/60">
            留下邮箱帮助我们判断开模优先级。本期仅收集意向；开模后的自动通知能力将在
            v0.3.1 提供。
          </p>
        </div>

        {submitted ? (
          <div
            role="status"
            className="rounded-store-lg border border-white/10 bg-white/6 p-6"
          >
            <CheckCircle2 className="text-store-accent size-8" />
            <p className="mt-4 text-lg font-semibold">登记成功</p>
            <p className="mt-2 text-sm leading-6 text-white/60">
              已记录你的需求。当前共有 {requestCount} 人登记该机型。
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-medium">接收邮箱</span>
              <span className="relative block">
                <Mail className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/35" />
                <input
                  required
                  type="email"
                  autoComplete="email"
                  maxLength={255}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'model-request-error' : undefined}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-white/12 bg-white/8 pr-4 pl-11 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/35 focus:ring-2 focus:ring-white/10"
                  placeholder="you@example.com"
                />
              </span>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-medium">
                补充说明 <span className="font-normal text-white/35">选填</span>
              </span>
              <textarea
                maxLength={200}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30 focus:border-white/35 focus:ring-2 focus:ring-white/10"
                placeholder="例如：希望保留磁吸、休眠或手写笔收纳"
              />
              <span className="mt-1 block text-right text-xs text-white/30">
                {note.length}/200
              </span>
            </label>
            {error ? (
              <p
                id="model-request-error"
                role="alert"
                className="rounded-xl bg-red-400/12 p-3 text-sm text-red-100"
              >
                {error}
              </p>
            ) : null}
            <button
              disabled={submitting || !email.trim()}
              className="bg-store-accent text-store-ink flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {submitting ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : null}
              登记这个机型
            </button>
            <p className="text-xs leading-5 text-white/35">
              邮箱仅用于本次机型需求记录，不会订阅营销邮件。
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
