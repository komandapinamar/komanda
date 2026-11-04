import Link from "next/link";
import { Chip } from "@/components/base/badges/chip";
import { Divider } from "@/components/base/divider/divider";
import AdminLoginCredentialsForm from "@/features/identity/web/AdminLoginCredentialsForm";

export default function AdminLoginForm() {
  return (
    <div className="flex w-full flex-col gap-5 rounded-2xl border border-border-component-detail-container bg-background-secondary-default p-6 shadow-card sm:p-8">
      <div className="flex flex-col items-start gap-2">
        <div className="flex w-full items-center justify-between">
          <span className="komanda-logo font-sans text-2xl font-normal tracking-tighter text-white normal-case">
            Komanda Business
          </span>
        </div>
        <h1 className="text-title-2-semibold text-text-primary">
          Iniciar sesión
        </h1>
        <p className="text-body-regular text-text-secondary">
          Ingresá con tu cuenta para administrar catálogo, pedidos y analíticas.
        </p>
      </div>

      <AdminLoginCredentialsForm />

      <Divider>o creá tu cuenta</Divider>

      <div className="flex items-center justify-between rounded-2lg border border-border-button-default bg-background-primary-default/50 px-4 py-3">
        <span className="text-body-2-regular text-text-secondary">
          ¿Querés abrir tu propio local?
        </span>
        <Link
          href="/register"
          className="text-body-2-semibold text-accent-400 hover:underline"
        >
          Registrá tu negocio
        </Link>
      </div>
    </div>
  );
}
