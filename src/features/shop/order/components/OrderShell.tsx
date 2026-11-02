"use client";

import { useEffect, useState, type ReactNode } from "react";
import CartAside from "@/features/shop/cart/components/CartAside";
import MobileCartDrawer from "@/features/shop/cart/components/MobileCartDrawer";
import { buildPublicDirectoryUrl } from "@/features/tenancy/utils/storefront-url";

export interface OrderShellProps {
  children?: ReactNode;
  showCart?: boolean;
  tenantSlug?: string;
}

export default function OrderShell({
  children,
  showCart = true,
  tenantSlug,
}: OrderShellProps) {
  const [directoryUrl, setDirectoryUrl] = useState("/");

  useEffect(() => {
    setDirectoryUrl(buildPublicDirectoryUrl({ tenantSlug }));
  }, [tenantSlug]);

  return (
    <div className="min-h-[100dvh] bg-[var(--color-accent-primary)]">
      <div className="w-full px-5 pt-4 pb-1 sm:px-8">
        <a
          href={directoryUrl}
          data-testid="classic-komanda-home-link"
          aria-label="Volver al menú principal de Komanda"
          title="Volver al menú principal de Komanda"
          className="komanda-logo inline-block font-sans text-2xl font-normal tracking-tighter text-white normal-case transition hover:opacity-80"
        >
          <span className="sm:hidden">Kda</span>
          <span className="hidden sm:inline">Komanda</span>
        </a>
      </div>
      {showCart ? (
        <div className="mx-auto max-w-7xl lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-6">
          <div className="min-w-0 p-4 pt-2 pb-24 lg:pb-6 lg:pr-0">{children}</div>
          <div className="hidden p-4 pt-2 pl-0 lg:block">
            <CartAside />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl">
          <div className="min-w-0 p-4 pt-2 pb-6">{children}</div>
        </div>
      )}
      {showCart ? <MobileCartDrawer /> : null}
    </div>
  );
}
