'use client';

import { ArrowRight, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useMemo, useState } from 'react';

interface DeviceOption {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  releaseYear: number | null;
  isDiscontinued: boolean;
  isMolded: boolean;
}

interface DeviceBrandOption {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  models: DeviceOption[];
}

interface DeviceSelectorProps {
  brands: DeviceBrandOption[];
}

function searchableText(brand: DeviceBrandOption, model: DeviceOption): string {
  return [brand.name, ...brand.aliases, model.name, ...model.aliases]
    .join(' ')
    .toLocaleLowerCase('zh-CN')
    .replaceAll(/\s+/g, '');
}

export function DeviceSelector({ brands }: DeviceSelectorProps) {
  const router = useRouter();
  const [brandId, setBrandId] = useState(brands[0]?.id ?? '');
  const [modelId, setModelId] = useState('');
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const selectedBrand = brands.find((brand) => brand.id === brandId);
  const selectedModel = selectedBrand?.models.find(
    (model) => model.id === modelId,
  );
  const compactQuery = query.toLocaleLowerCase('zh-CN').replaceAll(/\s+/g, '');
  const matches = useMemo(() => {
    if (!compactQuery) return [];
    return brands
      .flatMap((brand) => brand.models.map((model) => ({ brand, model })))
      .filter(({ brand, model }) =>
        searchableText(brand, model).includes(compactQuery),
      )
      .slice(0, 6);
  }, [brands, compactQuery]);

  function goToDevice(brandSlug: string, modelSlug: string): void {
    router.push(`/devices/${brandSlug}/${modelSlug}`);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === 'Escape') {
      setQuery('');
      setActiveMatchIndex(-1);
      return;
    }
    if (!matches.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveMatchIndex((current) => (current + 1) % matches.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveMatchIndex((current) =>
        current <= 0 ? matches.length - 1 : current - 1,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const match = matches[activeMatchIndex] ?? matches[0];
      if (match) goToDevice(match.brand.slug, match.model.slug);
    }
  }

  return (
    <div className="rounded-store-xl border border-white/12 bg-white/10 p-4 shadow-2xl backdrop-blur-xl sm:p-5">
      <p className="mb-3 text-sm font-semibold text-white">选择你的机型</p>
      {brands.length ? (
        <>
          <div className="grid gap-3 sm:grid-cols-[1fr_1.35fr_auto]">
            <label>
              <span className="sr-only">设备品牌</span>
              <select
                value={brandId}
                onChange={(event) => {
                  setBrandId(event.target.value);
                  setModelId('');
                }}
                className="h-12 w-full rounded-2xl border border-white/15 bg-white px-4 text-sm font-medium text-stone-900 outline-none focus:ring-2 focus:ring-white/50"
              >
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">设备型号</span>
              <select
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
                className="h-12 w-full rounded-2xl border border-white/15 bg-white px-4 text-sm font-medium text-stone-900 outline-none focus:ring-2 focus:ring-white/50"
              >
                <option value="">选择型号</option>
                {(selectedBrand?.models ?? []).map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                    {model.isDiscontinued ? '（已停产）' : ''}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!selectedBrand || !selectedModel}
              onClick={() =>
                selectedBrand &&
                selectedModel &&
                goToDevice(selectedBrand.slug, selectedModel.slug)
              }
              className="bg-store-accent text-store-ink flex h-12 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40"
            >
              找到它 <ArrowRight className="size-4" />
            </button>
          </div>

          <div className="relative mt-3">
            <label className="relative block">
              <span className="sr-only">搜索品牌或型号</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-white/45" />
              <input
                type="search"
                role="combobox"
                aria-autocomplete="list"
                aria-haspopup="listbox"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActiveMatchIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="输入品牌或型号，比如 阅星瞳 X4"
                aria-controls="device-search-results"
                aria-expanded={matches.length > 0}
                aria-activedescendant={
                  matches[activeMatchIndex]
                    ? `device-search-option-${matches[activeMatchIndex].model.id}`
                    : undefined
                }
                className="h-12 w-full rounded-2xl border border-white/12 bg-black/15 pr-4 pl-11 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/35 focus:ring-2 focus:ring-white/10"
              />
            </label>
            {compactQuery ? (
              <div
                id="device-search-results"
                role="listbox"
                aria-label="匹配的设备型号"
                className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-20 overflow-hidden rounded-2xl border border-stone-900/10 bg-white p-2 text-stone-900 shadow-2xl"
              >
                {matches.length ? (
                  matches.map(({ brand, model }, index) => (
                    <button
                      key={model.id}
                      id={`device-search-option-${model.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeMatchIndex}
                      onClick={() => goToDevice(brand.slug, model.slug)}
                      onMouseEnter={() => setActiveMatchIndex(index)}
                      className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left hover:bg-stone-100 focus:bg-stone-100"
                    >
                      <span>
                        <span className="block text-sm font-semibold">
                          {brand.name} {model.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-stone-400">
                          {model.releaseYear
                            ? `${model.releaseYear} 年`
                            : '年份待确认'}
                          {model.isMolded ? ' · 已开模' : ' · 可登记'}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-stone-400" />
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-4 text-sm text-stone-500">
                    暂未收录这个型号。可先选择相近机型查看，更多品牌将按登记需求补充。
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div
          role="status"
          className="rounded-2xl border border-dashed border-white/20 px-5 py-6 text-sm leading-6 text-white/60"
        >
          机型目录正在准备中。迁移完成后，这里会显示阅星瞳、Kindle、掌阅和文石机型。
        </div>
      )}
    </div>
  );
}
