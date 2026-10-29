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
      className="liquid-prism-ring liquid-glass-card flex flex-col justify-between rounded-3xl p-5 transition duration-300 ease-out hover:-translate-y-0.5"
    >
      <div>
        <div className="flex items-start justify-between gap-3.5">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9ba4]">
              {product.category}
            </span>
            <h3 className="mt-2.5 line-clamp-2 text-lg font-medium tracking-tight text-[#f4f3f1]">
              {product.name}
            </h3>
            <p className="mt-1 text-xs text-[#9b9ba4]">
              En{" "}
              <span className="font-medium text-[#f4f3f1]">
                {product.tenant.name}
              </span>{" "}
              <span className="text-[#9b9ba4]/70">
                (@{product.tenant.slug})
              </span>
            </p>
          </div>

          {product.imageUrl ? (
            <div className="relative size-18 shrink-0 overflow-hidden rounded-2xl bg-[#202024] ring-1 ring-white/12">
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                sizes="72px"
                unoptimized
              />
            </div>
          ) : (
            <div className="flex size-18 shrink-0 items-center justify-center rounded-2xl bg-[#202024] text-xl text-[#9b9ba4] ring-1 ring-white/10">
              ✦
            </div>
          )}
        </div>

        <div className="mt-4 flex items-baseline gap-1.5 tabular-nums">
          <span className="text-2xl font-medium tracking-tight text-[#f4f3f1]">
            ${product.price}
          </span>
          <span className="text-xs font-medium text-[#9b9ba4]">
            {product.currency}
          </span>
        </div>
      </div>

      <div className="mt-5">
        <a
          href={targetUrl}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#f4f3f1] px-4 text-xs font-medium text-[#141416] transition hover:bg-white active:scale-[0.98]"
        >
          <span>Pedir en {product.tenant.name}</span>
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </article>
  );
}
