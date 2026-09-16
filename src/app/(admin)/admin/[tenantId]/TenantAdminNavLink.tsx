"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type TenantAdminNavLinkProps = {
  href: string;
  children: ReactNode;
  activePaths?: readonly string[];
};

function matchesCurrentPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function TenantAdminNavLink({
  href,
  children,
  activePaths = [href],
}: TenantAdminNavLinkProps) {
  const pathname = usePathname();
  const isActive = activePaths.some((activePath) =>
    matchesCurrentPath(pathname, activePath),
  );

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`rounded-md px-3 py-2 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-accent-tertiary) ${
        isActive
          ? "bg-zinc-800 text-(--color-accent-tertiary) shadow-sm"
          : "text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}
