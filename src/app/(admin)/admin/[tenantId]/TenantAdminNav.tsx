"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export type TenantAdminNavItem = {
  href: string;
  label: string;
  activePaths?: readonly string[];
};

function matchesCurrentPath(pathname: string | null, href: string) {
  if (!pathname) return false;
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
      className={`inline-flex h-8 items-center justify-center rounded-lg px-3 text-body-medium transition outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring ${
        isActive
          ? "bg-button-primary text-text-white shadow-nav-selected"
          : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function TenantAdminNav({
  items,
  switchBusiness,
}: {
  items: TenantAdminNavItem[];
  switchBusiness: ReactNode;
}) {
  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" aria-label="Navegación principal">
        <div className="flex items-center gap-1 rounded-2lg bg-background-full p-1">
          {items.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
        </div>
        <div className="ms-2">{switchBusiness}</div>
      </nav>
      <details className="relative md:hidden">
        <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-border-button-default bg-background-primary-default px-3 text-body-medium text-text-primary shadow-xs marker:hidden [&::-webkit-details-marker]:hidden">
          Menú
          <span aria-hidden className="text-text-secondary">▾</span>
        </summary>
        <nav
          className="absolute right-0 top-10 z-50 grid min-w-52 gap-1 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-2 shadow-dropdown"
          aria-label="Navegación principal"
        >
          {items.map((item) => (
            <NavItem key={item.href} item={item} />
          ))}
          <div className="mt-1 border-t border-separator-border pt-1.5">
            {switchBusiness}
          </div>
        </nav>
      </details>
    </>
  );
}
