"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type TenantAdminNavItem = {
  href: string;
  label: string;
  activePaths?: readonly string[];
};

function matchesCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItem({ item }: { item: TenantAdminNavItem }) {
  const pathname = usePathname();
  const isActive = (item.activePaths ?? [item.href]).some((activePath) =>
    matchesCurrentPath(pathname, activePath),
  );

  return (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-md px-3 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent-tertiary) ${
        isActive
          ? "bg-zinc-800 text-(--color-accent-tertiary) shadow-sm"
          : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function TenantAdminNav({ items, switchBusiness }: { items: TenantAdminNavItem[]; switchBusiness: ReactNode }) {
  return (
    <>
      <nav className="hidden items-center gap-1 text-sm md:flex" aria-label="Navegación principal">
        {items.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
        {switchBusiness}
      </nav>
      <details className="relative md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-sm font-medium text-zinc-100 marker:hidden [&::-webkit-details-marker]:hidden">
          Menú
          <span aria-hidden className="text-zinc-500">v</span>
        </summary>
        <nav
          className="absolute right-0 top-12 z-20 grid min-w-52 gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-2 text-sm shadow-xl"
          aria-label="Navegación principal"
        >
          {items.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
          {switchBusiness}
        </nav>
      </details>
    </>
  );
}
