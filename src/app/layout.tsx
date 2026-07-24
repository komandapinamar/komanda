import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { logoutAdmin } from "@/features/admin-panel/actions/logout.action";
import { cookies } from "next/headers";
import { coreSessionService } from "@/features/identity/web/authenticated-session";
import { SESSION_COOKIE_NAME } from "@/features/identity/web/session-cookie";
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
  title: "KOMANDA",
  description: "Your ticketing home",
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

  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  const isAdminLoggedIn = token
    ? await coreSessionService().resolve(token).then(() => true).catch(() => false)
    : false;

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-[var(--color-accent-primary)] antialiased overflow-x-hidden`}
      >
        {children}
        <footer className="bg-[var(--color-accent-primary)] text-[var(--color-accent-secondary)] underline p-2 text-center">
          {isAdminLoggedIn ? (
            <form action={logoutAdmin} className="inline">
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
