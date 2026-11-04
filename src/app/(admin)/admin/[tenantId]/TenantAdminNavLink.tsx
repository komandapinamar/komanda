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
      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4f3f1] ${
        isActive
          ? "bg-[#f4f3f1] text-[#141416] shadow-sm"
          : "text-[#c2c2cc] hover:bg-white/[0.06] hover:text-[#f4f3f1]"
      }`}
    >
      {children}
    </Link>
  );
}
