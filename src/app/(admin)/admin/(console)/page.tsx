import { ArrowRight, Boxes, PackageCheck, TriangleAlert } from 'lucide-react';
import Link from 'next/link';

import { requirePermission } from '@/lib/auth/admin';

export default async function AdminDashboardPage() {
  const admin = await requirePermission('dashboard:view');

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-7 lg:px-10 lg:py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-neutral-400">
            OVERVIEW
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-900">
            早上好，{admin.name}
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            后台基础能力已就绪，耗材管理模块现在可以使用。
          </p>
        </div>
        <p className="text-sm text-neutral-400">3D 打印生产运营后台</p>
      </div>

      <div className="mt-9 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-black/6 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.03)]">
          <span className="grid size-10 place-items-center rounded-xl bg-lime-100 text-lime-800">
            <Boxes className="size-5" />
          </span>
          <p className="mt-5 text-sm text-neutral-500">当前模块</p>
          <p className="mt-1 text-xl font-semibold">耗材与库存</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-5 opacity-65">
          <span className="grid size-10 place-items-center rounded-xl bg-neutral-100 text-neutral-500">
            <PackageCheck className="size-5" />
          </span>
          <p className="mt-5 text-sm text-neutral-500">后续模块</p>
          <p className="mt-1 text-xl font-semibold">商品与生产</p>
        </div>
        <div className="rounded-2xl border border-black/6 bg-white p-5 opacity-65">
          <span className="grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <TriangleAlert className="size-5" />
          </span>
          <p className="mt-5 text-sm text-neutral-500">低库存预警</p>
          <p className="mt-1 text-xl font-semibold">进入耗材列表查看</p>
        </div>
      </div>

      <Link
        href="/admin/materials"
        className="group mt-6 flex items-center justify-between rounded-2xl bg-[#151816] p-6 text-white transition hover:bg-black"
      >
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-lime-300">
            MATERIALS
          </p>
          <h2 className="mt-2 text-xl font-semibold">管理耗材库存</h2>
          <p className="mt-1 text-sm text-white/50">
            录入耗材、办理入库、盘点调整并查看库存流水
          </p>
        </div>
        <span className="grid size-11 place-items-center rounded-full bg-white/8 transition group-hover:bg-lime-300 group-hover:text-black">
          <ArrowRight className="size-5" />
        </span>
      </Link>
    </div>
  );
}
