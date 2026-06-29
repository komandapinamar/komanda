import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { logoutAdmin } from "@/features/admin-panel/actions/logout.action";
import { getAuthenticatedAdminSession } from "@/features/admin-panel/server/auth.service";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hamburguesas de Autor",
  description: "Hamburguesas de Autor",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const adminSession = await getAuthenticatedAdminSession();
  const isAdminLoggedIn = Boolean(adminSession);

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-[var(--color-accent-primary)] antialiased overflow-x-hidden`}
      >
        <header className="bg-[var(--color-accent-secondary)] flex justify-between items-center px-6 py-4 shadow-md sticky top-0 z-50 border-black border-b-6">
          <Link href="/" className="text-[var(--color-accent-primary)] font-black text-xl tracking-tight uppercase hover:text-white/90 transition-colors duration-200">
            Hamburguesas <span className="text-[var(--color-accent-tertiary)]">De Autor</span>
          </Link>
          <Link href="/order" className="shrink-0 whitespace-nowrap bg-[var(--color-accent-primary)] hover:bg-[var(--color-accent-tertiary)] text-[var(--color-accent-secondary)] font-bold py-2 px-5 rounded-full hover:-translate-y-0.5 hover:text-[var(--color-accent-primary)] transition-all duration-200 text-sm uppercase tracking-wide">
            PEDI AHORA
          </Link>
        </header>
        {children}
        <footer className="bg-[var(--color-accent-primary)] text-[var(--color-accent-secondary)] underline p-2 text-center">
          <Link href="/admin">
            Admin panel
          </Link>
          {isAdminLoggedIn ? (
            <form action={logoutAdmin} className="inline">
              <span className="mx-2">|</span>
              <button type="submit" className="hover:opacity-80 transition-opacity duration-200">
                Cerrar sesion
              </button>
            </form>
          ) : null}
        </footer>
      </body>
    </html>
  );
}
