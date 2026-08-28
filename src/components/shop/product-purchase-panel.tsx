'use client';

import {
  Check,
  Minus,
  Plus,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

interface ProductVariant {
  id: string;
  skuCode: string;
  name: string;
  attributes: Record<string, string>;
  price: string;
  comparePrice: string | null;
  imageUrl: string | null;
}

interface AvailabilityResponse {
  code: number;
  data: { variants: Array<{ variantId: string; availableQty: number }> } | null;
  message: string;
}

interface ProductPurchasePanelProps {
  slug: string;
  variants: ProductVariant[];
}

const dimensionLabels: Record<string, string> = {
  size: '尺寸',
  material: '材质',
  color: '颜色',
  style: '款式',
};

export function ProductPurchasePanel({
  slug,
  variants,
}: ProductPurchasePanelProps) {
  const [availability, setAvailability] = useState<Map<string, number> | null>(
    null,
  );
  const [availabilityError, setAvailabilityError] = useState(false);
  const [selectedAttributes, setSelectedAttributes] = useState<
    Record<string, string>
  >({});
  const [quantity, setQuantity] = useState(1);
  const [notice, setNotice] = useState<string | null>(null);

  const normalizedVariants = useMemo(
    () =>
      variants.map((variant) => ({
        ...variant,
        selection:
          Object.keys(variant.attributes).length > 0
            ? variant.attributes
            : { variant: variant.name },
      })),
    [variants],
  );
  const dimensions = useMemo(
    () => [
      ...new Set(
        normalizedVariants.flatMap((variant) => Object.keys(variant.selection)),
      ),
    ],
    [normalizedVariants],
  );

  const loadAvailability = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/products/${encodeURIComponent(slug)}/availability`,
        {
          cache: 'no-store',
        },
      );
      const body = (await response.json()) as AvailabilityResponse;
      if (!response.ok || body.code !== 0 || !body.data)
        throw new Error(body.message);
      setAvailability(
        new Map(
          body.data.variants.map((item) => [item.variantId, item.availableQty]),
        ),
      );
      setAvailabilityError(false);
    } catch {
      setAvailability(new Map());
      setAvailabilityError(true);
    }
  }, [slug]);

  useEffect(() => {
    void loadAvailability();
    const timer = window.setInterval(() => void loadAvailability(), 30_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void loadAvailability();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loadAvailability]);

  useEffect(() => {
    if (!availability || normalizedVariants.length !== 1) return;
    const onlyVariant = normalizedVariants[0]!;
    if ((availability.get(onlyVariant.id) ?? 0) > 0) {
      setSelectedAttributes(onlyVariant.selection);
    }
  }, [availability, normalizedVariants]);

  const selectedVariant = normalizedVariants.find((variant) =>
    dimensions.every(
      (dimension) =>
        variant.selection[dimension] === selectedAttributes[dimension],
    ),
  );
  const selectedAvailableQty = selectedVariant
    ? (availability?.get(selectedVariant.id) ?? 0)
    : 0;
  const displayVariant = selectedVariant ?? normalizedVariants[0];

  function optionIsAvailable(dimension: string, value: string): boolean {
    if (!availability) return false;
    return normalizedVariants.some((variant) => {
      if (variant.selection[dimension] !== value) return false;
      const matchesOtherSelections = dimensions.every(
        (otherDimension) =>
          otherDimension === dimension ||
          !selectedAttributes[otherDimension] ||
          variant.selection[otherDimension] ===
            selectedAttributes[otherDimension],
      );
      return matchesOtherSelections && (availability.get(variant.id) ?? 0) > 0;
    });
  }

  function chooseOption(dimension: string, value: string): void {
    setSelectedAttributes((current) => ({ ...current, [dimension]: value }));
    setQuantity(1);
    setNotice(null);
  }

  const purchasable = Boolean(
    selectedVariant && selectedAvailableQty > 0 && !availabilityError,
  );

  return (
    <div>
      <div className="flex items-end gap-3">
        <p className="text-3xl font-semibold tracking-[-0.03em]">
          {displayVariant ? `¥${displayVariant.price}` : '暂未定价'}
        </p>
        {displayVariant?.comparePrice ? (
          <p className="pb-1 text-sm text-stone-400 line-through">
            ¥{displayVariant.comparePrice}
          </p>
        ) : null}
      </div>

      {variants.length === 0 ? (
        <div className="mt-7 rounded-2xl bg-amber-50 px-4 py-4 text-sm text-amber-800">
          当前商品尚未配置可售变体。
        </div>
      ) : (
        <div className="mt-8 space-y-7">
          {dimensions.map((dimension) => {
            const values = [
              ...new Set(
                normalizedVariants.flatMap((variant) =>
                  variant.selection[dimension]
                    ? [variant.selection[dimension]]
                    : [],
                ),
              ),
            ];
            return (
              <fieldset key={dimension}>
                <legend className="mb-3 text-sm font-semibold">
                  {dimensionLabels[dimension] ?? dimension}
                  {selectedAttributes[dimension] ? (
                    <span className="ml-2 font-normal text-stone-400">
                      {selectedAttributes[dimension]}
                    </span>
                  ) : null}
                </legend>
                <div className="flex flex-wrap gap-2.5">
                  {values.map((value) => {
                    const available = optionIsAvailable(dimension, value);
                    const selected = selectedAttributes[dimension] === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!available}
                        onClick={() => chooseOption(dimension, value)}
                        className={`relative min-w-20 rounded-xl border px-4 py-2.5 text-sm transition ${
                          selected
                            ? 'border-[#17251c] bg-[#17251c] text-white'
                            : available
                              ? 'border-stone-900/12 bg-white hover:border-stone-900/35'
                              : 'cursor-not-allowed border-stone-900/6 bg-stone-100 text-stone-300 line-through'
                        }`}
                      >
                        {value}
                        {selected ? (
                          <Check className="ml-2 inline size-3.5" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      {availability === null ? (
        <div className="mt-5 flex items-center gap-2 text-sm text-stone-400">
          <span className="size-3 animate-pulse rounded-full bg-stone-300" />{' '}
          正在获取实时可售状态…
        </div>
      ) : availabilityError ? (
        <button
          type="button"
          onClick={() => void loadAvailability()}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-red-600"
        >
          <RefreshCcw className="size-4" /> 获取可售状态失败，点击重试
        </button>
      ) : selectedVariant ? (
        <p
          className={`mt-5 text-sm font-medium ${selectedAvailableQty > 0 ? 'text-[#3d6247]' : 'text-red-600'}`}
        >
          {selectedAvailableQty === 0
            ? '暂时缺货'
            : selectedAvailableQty < 5
              ? `仅剩 ${selectedAvailableQty} 件`
              : '可按单生产'}
        </p>
      ) : (
        <p className="mt-5 text-sm text-stone-500">请选择完整的商品规格</p>
      )}

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <div className="flex h-12 w-36 items-center justify-between rounded-full border border-stone-900/12 bg-white px-2">
          <button
            type="button"
            aria-label="减少数量"
            disabled={quantity <= 1}
            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            className="grid size-9 place-items-center disabled:text-stone-300"
          >
            <Minus className="size-4" />
          </button>
          <span className="text-sm font-semibold tabular-nums">{quantity}</span>
          <button
            type="button"
            aria-label="增加数量"
            disabled={!purchasable || quantity >= selectedAvailableQty}
            onClick={() =>
              setQuantity((value) => Math.min(selectedAvailableQty, value + 1))
            }
            className="grid size-9 place-items-center disabled:text-stone-300"
          >
            <Plus className="size-4" />
          </button>
        </div>
        <button
          type="button"
          disabled={!purchasable}
          onClick={() => setNotice('购物车将在下一阶段接入。')}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-[#17251c] px-6 text-sm font-bold text-[#17251c] disabled:cursor-not-allowed disabled:border-stone-200 disabled:text-stone-300"
        >
          <ShoppingBag className="size-4" /> 加入购物车
        </button>
        <button
          type="button"
          disabled={!purchasable}
          onClick={() => setNotice('立即购买将在购物车与下单阶段接入。')}
          className="h-12 flex-1 rounded-full bg-[#17251c] px-6 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-stone-400"
        >
          立即购买
        </button>
      </div>
      {notice ? (
        <p className="mt-3 text-center text-xs text-stone-500">{notice}</p>
      ) : null}

      <div className="mt-8 grid grid-cols-2 gap-3 border-t border-stone-900/8 pt-7 text-xs text-stone-500">
        <p className="flex items-center gap-2">
          <Truck className="size-4 text-[#59705f]" /> 按单生产后发货
        </p>
        <p className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-[#59705f]" /> 出库前逐件检查
        </p>
      </div>
    </div>
  );
}
