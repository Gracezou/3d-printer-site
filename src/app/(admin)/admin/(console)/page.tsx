import {
  ArrowRight,
  CircleDollarSign,
  ClipboardList,
  PackageCheck,
  Printer,
  ShieldAlert,
} from 'lucide-react';
import Link from 'next/link';

import { requirePermission } from '@/lib/auth/admin';
import { getAdminDashboard } from '@/lib/services/dashboard.service';

export default async function AdminDashboardPage() {
  const admin = await requirePermission('dashboard:view');
  const dashboard = await getAdminDashboard();

  const metrics = [
    {
      label: '今日订单',
      value: String(dashboard.todayOrderCount),
      suffix: '单',
      icon: ClipboardList,
      tone: 'bg-sky-100 text-sky-700',
    },
    {
      label: '今日销售额',
      value: `¥${dashboard.todaySalesAmount}`,
      suffix: '',
      icon: CircleDollarSign,
      tone: 'bg-lime-100 text-lime-800',
    },
    {
      label: '待排产',
      value: String(dashboard.pendingProductionCount),
      suffix: '项',
      icon: Printer,
      tone: 'bg-violet-100 text-violet-700',
    },
    {
      label: '待发货',
      value: String(dashboard.pendingShipmentCount),
      suffix: '单',
      icon: PackageCheck,
      tone: 'bg-orange-100 text-orange-700',
    },
    {
      label: '支付待复核',
      value: String(dashboard.needsReviewPaymentCount),
      suffix: '笔',
      icon: ShieldAlert,
      tone:
        dashboard.needsReviewPaymentCount > 0
          ? 'bg-rose-100 text-rose-700'
          : 'bg-neutral-100 text-neutral-600',
    },
  ];

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
            今日经营数据、生产待办与库存风险集中展示。
          </p>
        </div>
        <p className="text-sm text-neutral-400">3D 打印生产运营后台</p>
      </div>

      <div className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.label}
              className="rounded-2xl border border-black/6 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.03)]"
            >
              <span
                className={`grid size-10 place-items-center rounded-xl ${metric.tone}`}
              >
                <Icon className="size-5" />
              </span>
              <p className="mt-5 text-sm text-neutral-500">{metric.label}</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight">
                {metric.value}
                {metric.suffix ? (
                  <span className="ml-1 text-sm font-medium text-neutral-400">
                    {metric.suffix}
                  </span>
                ) : null}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        <section className="rounded-2xl border border-black/6 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-neutral-400">
                INVENTORY ALERTS
              </p>
              <h2 className="mt-2 text-xl font-semibold">低库存耗材</h2>
            </div>
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              {dashboard.lowStockMaterials.length} 项
            </span>
          </div>
          {dashboard.lowStockMaterials.length ? (
            <div className="mt-5 divide-y divide-black/6">
              {dashboard.lowStockMaterials.map((material) => (
                <div
                  key={material.id}
                  className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="size-3 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: material.colorHex ?? '#ddd' }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {material.name}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-400">
                        {material.code}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-rose-700">
                      可用 {material.availableGrams}g
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      安全线 {material.safetyGrams}g
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-700">
              当前没有低库存耗材。
            </div>
          )}
          <Link
            href="/admin/materials"
            className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-700 hover:text-black"
          >
            查看耗材库存 <ArrowRight className="size-4" />
          </Link>
        </section>

        <div className="space-y-4">
          <Link
            href="/admin/production"
            className="group flex items-center justify-between rounded-2xl bg-[#151816] p-6 text-white transition hover:bg-black"
          >
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-lime-300">
                PRODUCTION
              </p>
              <h2 className="mt-2 text-xl font-semibold">进入生产看板</h2>
              <p className="mt-1 text-sm text-white/50">
                {dashboard.pendingProductionCount} 项任务等待排产
              </p>
            </div>
            <span className="grid size-11 place-items-center rounded-full bg-white/8 transition group-hover:bg-lime-300 group-hover:text-black">
              <ArrowRight className="size-5" />
            </span>
          </Link>
          <Link
            href="/admin/orders?status=pending_shipment"
            className="flex items-center justify-between rounded-2xl border border-black/6 bg-white p-6 shadow-sm"
          >
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-orange-500">
                SHIPPING
              </p>
              <h2 className="mt-2 text-lg font-semibold">处理待发货订单</h2>
            </div>
            <PackageCheck className="size-6 text-orange-500" />
          </Link>
        </div>
      </div>
    </div>
  );
}
