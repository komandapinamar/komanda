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
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f3f1] ${
        isActive
          ? "bg-[#f4f3f1] text-[#141416] shadow-sm"
          : "text-[#c2c2cc] hover:bg-white/[0.06] hover:text-[#f4f3f1]"
      }`}
    >
      {item.label}
    </Link>
  );
}

export function TenantAdminNav({ items, switchBusiness }: { items: TenantAdminNavItem[]; switchBusiness: ReactNode }) {
  return (
    <>
      <nav className="hidden items-center gap-1.5 text-xs md:flex" aria-label="Navegación principal">
        {items.map((item) => (
          <NavItem key={item.href} item={item} />
        ))}
        {switchBusiness}
      </nav>
      <details className="relative md:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3.5 py-1.5 text-xs font-medium text-[#f4f3f1] marker:hidden [&::-webkit-details-marker]:hidden">
          Menú
          <span aria-hidden className="text-[#c2c2cc]">▾</span>
        </summary>
        <nav
          className="liquid-glass-card absolute right-0 top-11 z-50 grid min-w-52 gap-1 rounded-2xl p-2 text-xs shadow-2xl"
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
