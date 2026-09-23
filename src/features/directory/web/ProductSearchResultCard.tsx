"use client";

import Image from "next/image";
import type { SearchProductResult } from "@/features/search/domain/search.schemas";
import { buildStorefrontUrl } from "@/features/tenancy/utils/storefront-url";

type Props = {
  product: SearchProductResult;
};

export function ProductSearchResultCard({ product }: Props) {
  const options =
    typeof window !== "undefined"
      ? { host: window.location.host, protocol: window.location.protocol }
      : undefined;

  const baseUrl = buildStorefrontUrl(product.tenant.slug, options);
  const targetUrl = `${baseUrl}/order${product.storefrontPath}`;

  return (
    <article
      data-testid="search-product-card"
      data-item-id={product.itemId}
      className="flex flex-col justify-between rounded-xl border-2 border-zinc-200 bg-black/60 p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] backdrop-blur-2xl transition hover:-translate-y-1 hover:shadow-[8px_8px_0_0_var(--color-zinc-200)]"
    >
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="inline-block rounded-md border border-white/20 bg-zinc-800/80 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-300">
              {product.category}
            </span>
            <h3 className="mt-2 text-xl font-black uppercase tracking-tight text-white line-clamp-2">
              {product.name}
            </h3>
            <p className="mt-1 text-xs font-bold text-zinc-400">
              Vendido por{" "}
              <span className="text-[var(--color-accent-secondary)]">
                {product.tenant.name}
              </span>{" "}
              <span className="text-zinc-500 font-mono text-[11px]">
                (@{product.tenant.slug})
              </span>
            </p>
          </div>

          {product.imageUrl ? (
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-black bg-zinc-800 shadow-[2px_2px_0_0_black]">
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                sizes="80px"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border-2 border-black bg-zinc-800 text-2xl font-black text-zinc-600 shadow-[2px_2px_0_0_black]">
              🍽️
            </div>
          )}
        </div>

        <div className="mt-4 flex items-baseline gap-1.5">
          <span className="text-2xl font-black text-white tracking-tight">
            ${product.price}
          </span>
          <span className="text-xs font-bold text-zinc-400 uppercase">
            {product.currency}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <a
          href={targetUrl}
          className="block w-full rounded-xl border-2 border-zinc-200 bg-[var(--color-accent-primary)] py-2.5 px-4 text-center text-xs font-black uppercase tracking-wider text-[var(--color-accent-secondary)] shadow-[3px_3px_0_0_black] transition hover:bg-zinc-700 active:translate-x-[1px] active:translate-y-[1px] active:shadow-[2px_2px_0_0_white]"
        >
          Pedir en {product.tenant.name} →
        </a>
      </div>
    </article>
  );
}
