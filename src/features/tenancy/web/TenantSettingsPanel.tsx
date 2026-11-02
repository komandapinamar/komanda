"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { LocationPicker } from "@/features/location/web/LocationPicker";
import type { LocationAddress } from "@/features/location/application/location.schemas";
import {
  normalizeOpeningHours,
  type OpeningHours,
} from "@/features/tenancy/domain/opening-hours";
import { OpeningHoursEditor } from "@/features/tenancy/web/OpeningHoursEditor";

export type TenantSettingsView = {
  tenantId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  salesEnabled: boolean;
  printingEnabled: boolean;
  menuTheme?: "classic" | "reels";
  preset?: "gastronomy" | "express_retail";
  ownerCashAlertWhatsAppPhone?: string | null;
  currency: string;
  timezone: string;
  version: number;
  location?: LocationAddress | null;
  openingHours?: OpeningHours | null;
};

const presetLabels: Record<
  NonNullable<TenantSettingsView["preset"]>,
  string
> = {
  gastronomy: "Gastronomía (Komanda POS)",
  express_retail: "Autoservicio / Kiosco (Komanda Kiosk)",
};

async function jsonOrThrow(response: Response) {
  if (response.ok) return response.json();
  if (response.status === 422) {
    throw new Error("Ingresá un celular argentino válido. Los avisos por WhatsApp solo se habilitan para negocios Express.");
  }
  if (response.status === 409) {
    throw new Error("La configuración cambió. Recargá antes de guardar.");
  }
  throw new Error("No se pudo guardar la configuración.");
}

export function TenantSettingsPanel({
  initialSettings,
}: {
  initialSettings: TenantSettingsView;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [menuTheme, setMenuTheme] = useState<"classic" | "reels">(
    initialSettings.menuTheme ?? "classic",
  );
  const [location, setLocation] = useState<LocationAddress | null>(initialSettings.location ?? null);
  const [openingHours, setOpeningHours] = useState<OpeningHours>(
    normalizeOpeningHours(initialSettings.openingHours),
  );
  const isExpressRetail = settings.preset === "express_retail";

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const menuTheme = form.get("menuTheme");
    const ownerPhone = form.get("ownerCashAlertWhatsAppPhone");
    try {
      const updated = (await jsonOrThrow(
        await fetch(`/api/v1/tenants/${settings.tenantId}/settings`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "If-Match": String(settings.version),
          },
          body: JSON.stringify({
            contactName: form.get("contactName"),
            contactEmail: form.get("contactEmail"),
            contactPhone: form.get("contactPhone"),
            timezone: form.get("timezone"),
            printingEnabled: form.get("printingEnabled") === "on",
            ...(isExpressRetail
              ? {
                  ownerCashAlertWhatsAppPhone:
                    typeof ownerPhone === "string" && ownerPhone.trim().length > 0
                      ? ownerPhone.trim()
                      : null,
                }
              : {}),
            ...(menuTheme === "classic" || menuTheme === "reels"
              ? { menuTheme }
              : {}),
            ...(location ? { location } : {}),
            openingHours,
          }),
        }),
      )) as TenantSettingsView;
      setSettings(updated);
      setMenuTheme(updated.menuTheme ?? "classic");
      setOpeningHours(normalizeOpeningHours(updated.openingHours));
      setMessage("Configuración guardada.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  const inputClass =
    "rounded-2xl border border-white/12 bg-[#101013]/90 px-3.5 py-2.5 text-sm text-[#f4f3f1] placeholder:text-[#9b9ba4] outline-none transition focus:border-white/30 focus:ring-2 focus:ring-white/15";

  return (
    <form onSubmit={save} className="grid gap-5">
      {message ? (
        <p role="status" className="rounded-2xl border border-white/12 bg-[#101013]/90 px-4 py-3 text-sm text-[#f4f3f1]">
          {message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="text-xs font-medium text-[#c2c2cc]">Nombre</span>
          <input
            name="contactName"
            defaultValue={settings.contactName ?? ""}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-xs font-medium text-[#c2c2cc]">Email operativo</span>
          <input
            name="contactEmail"
            type="email"
            defaultValue={settings.contactEmail ?? ""}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-xs font-medium text-[#c2c2cc]">Teléfono</span>
          <input
            name="contactPhone"
            defaultValue={settings.contactPhone ?? ""}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-xs font-medium text-[#c2c2cc]">Zona horaria</span>
          <input
            required
            name="timezone"
            defaultValue={settings.timezone}
            className={inputClass}
          />
        </label>
      </div>
      <div className="grid gap-1.5 border-t border-white/[0.08] pt-5">
        <span className="block text-sm font-medium text-[#f4f3f1]">
          Perfil operativo del negocio
        </span>
        <span className="block text-sm text-[#d4d4dc]">
          {presetLabels[settings.preset ?? "gastronomy"]}
        </span>
        <span className="block text-xs text-[#c2c2cc]">
          El perfil se define al registrar el negocio y no puede modificarse.
        </span>
      </div>
      <section id="ubicacion-sede" className="scroll-mt-24 grid gap-3 border-t border-white/[0.08] pt-5">
        <div>
          <h2 className="text-sm font-medium text-[#f4f3f1]">Ubicación del local primario</h2>
          <p className="text-xs text-[#c2c2cc]">La ubicación exacta se publica en el directorio.</p>
        </div>
        <LocationPicker initialValue={location} onConfirm={setLocation} />
      </section>

      <section id="horarios-apertura" className="scroll-mt-24 grid gap-3 border-t border-white/[0.08] pt-5">
        <div>
          <h2 className="text-sm font-medium text-[#f4f3f1]">Horarios de apertura</h2>
          <p className="text-xs text-[#c2c2cc]">
            Se muestran en la página principal junto al teléfono del negocio y regulan los retiros programados.
          </p>
        </div>
        <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
      </section>

      {!isExpressRetail ? (
        <div className="grid gap-3 border-t border-white/[0.08] pt-5">
          <div>
            <span className="block text-sm font-medium text-[#f4f3f1]">
              Tema del menú digital (QR)
            </span>
            <span className="block text-xs text-[#c2c2cc]">
              Elegí la presentación visual que verán tus clientes al escanear la carta.
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/12 bg-[#101013]/90 p-4 transition hover:border-white/25">
              <input
                type="radio"
                name="menuTheme"
                value="classic"
                checked={menuTheme === "classic"}
                className="mt-0.5 accent-[#f4f3f1]"
                onChange={() => setMenuTheme("classic")}
              />
              <div>
                <span className="block text-sm font-medium text-[#f4f3f1]">Clásico</span>
                <span className="mt-0.5 block text-xs text-[#c2c2cc]">
                  Grilla tradicional con categorías, descripciones y tarjetas de platos.
                </span>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/12 bg-[#101013]/90 p-4 transition hover:border-white/25">
              <input
                type="radio"
                name="menuTheme"
                value="reels"
                checked={menuTheme === "reels"}
                className="mt-0.5 accent-[#f4f3f1]"
                onChange={() => setMenuTheme("reels")}
              />
              <div>
                <span className="block text-sm font-medium text-[#f4f3f1]">Reels</span>
                <span className="mt-0.5 block text-xs text-[#c2c2cc]">
                  Experiencia vertical inmersiva a pantalla completa con videos y fotos dinámicas.
                </span>
              </div>
            </label>
          </div>
        </div>
      ) : null}

      {isExpressRetail ? (
        <div className="grid gap-2 border-t border-white/[0.08] pt-5">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[#f4f3f1]">
              WhatsApp para avisos de pedidos en efectivo
            </span>
            <span className="text-xs text-[#c2c2cc]">
              Ingresá tu celular argentino (por ejemplo, +54 9 11 2345-6789). Al guardar, aceptás recibir avisos de pedidos pendientes de pago por WhatsApp. Dejá el campo vacío y guardá para desactivar los avisos.
            </span>
            <input
              name="ownerCashAlertWhatsAppPhone"
              type="tel"
              defaultValue={settings.ownerCashAlertWhatsAppPhone ?? ""}
              placeholder="+54 9 11 2345-6789"
              className={inputClass}
            />
          </label>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.08] pt-5 text-sm text-[#d4d4dc]">
        <label className="flex items-center gap-2.5">
          <input
            name="printingEnabled"
            type="checkbox"
            defaultChecked={settings.printingEnabled}
            className="accent-[#f4f3f1]"
          />
          <span>Habilitar impresión por Komanda Desktop</span>
        </label>
      </div>
      <button className="inline-flex h-10 w-fit items-center justify-center rounded-full bg-[#f4f3f1] px-6 text-sm font-medium text-[#141416] transition hover:bg-white">
        Guardar configuración
      </button>
    </form>
  );
}
