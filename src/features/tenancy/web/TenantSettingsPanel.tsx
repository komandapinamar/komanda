"use client";

import { FormEvent, useState } from "react";

export type TenantSettingsView = {
  tenantId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  salesEnabled: boolean;
  printingEnabled: boolean;
  menuTheme?: "classic" | "reels";
  preset?: "gastronomy" | "express_retail";
  slackCashAlertWebhookUrl?: string | null;
  currency: string;
  timezone: string;
  version: number;
};

async function jsonOrThrow(response: Response) {
  if (response.ok) return response.json();
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
  const [settings, setSettings] = useState(initialSettings);
  const [message, setMessage] = useState<string | null>(null);
  const [tenantType, setTenantType] = useState<
    "gastronomy" | "express_retail"
  >(initialSettings.preset ?? "gastronomy");
  const [menuTheme, setMenuTheme] = useState<"classic" | "reels">(
    initialSettings.menuTheme ?? "classic",
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const menuTheme = form.get("menuTheme");
    const preset = form.get("preset");
    const slackWebhook = form.get("slackCashAlertWebhookUrl");
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
            slackCashAlertWebhookUrl: typeof slackWebhook === "string" && slackWebhook.trim().length > 0 ? slackWebhook.trim() : null,
            ...(menuTheme === "classic" || menuTheme === "reels"
              ? { menuTheme }
              : {}),
            ...(preset === "gastronomy" || preset === "express_retail"
              ? { preset }
              : {}),
          }),
        }),
      )) as TenantSettingsView;
      setSettings(updated);
      setTenantType(updated.preset ?? "gastronomy");
      setMenuTheme(updated.menuTheme ?? "classic");
      setMessage("Configuración guardada.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error inesperado.");
    }
  }

  const inputClass =
    "rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm";

  return (
    <form onSubmit={save} className="grid gap-5">
      {message ? (
        <p role="status" className="rounded-md border border-zinc-800 bg-zinc-900 p-3 text-sm">
          {message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          <span className="text-zinc-400">Nombre</span>
          <input
            name="contactName"
            defaultValue={settings.contactName ?? ""}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-zinc-400">Email operativo</span>
          <input
            name="contactEmail"
            type="email"
            defaultValue={settings.contactEmail ?? ""}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-zinc-400">Teléfono</span>
          <input
            name="contactPhone"
            defaultValue={settings.contactPhone ?? ""}
            className={inputClass}
          />
        </label>
        <label className="grid gap-2 text-sm">
          <span className="text-zinc-400">Zona horaria</span>
          <input
            required
            name="timezone"
            defaultValue={settings.timezone}
            className={inputClass}
          />
        </label>
      </div>
      <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <div>
          <span className="block text-sm font-medium text-zinc-200">
            Perfil operativo del negocio
          </span>
          <span className="block text-xs text-zinc-400">
            Define la experiencia del backoffice y los módulos disponibles para tu rubro.
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-950 p-3.5 transition hover:border-zinc-500">
            <input
              type="radio"
              name="preset"
              value="gastronomy"
              defaultChecked={(settings.preset ?? "gastronomy") === "gastronomy"}
              className="mt-0.5 accent-[var(--color-accent-tertiary)]"
              onChange={() => setTenantType("gastronomy")}
            />
            <div>
              <span className="block text-sm font-medium text-zinc-100">Gastronomía (Komanda POS)</span>
              <span className="mt-0.5 block text-xs text-zinc-400">
                Menú digital QR, gestión de pedidos y pagos online.
              </span>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-950 p-3.5 transition hover:border-zinc-500">
            <input
              type="radio"
              name="preset"
              value="express_retail"
              defaultChecked={settings.preset === "express_retail"}
              className="mt-0.5 accent-[var(--color-accent-tertiary)]"
              onChange={() => setTenantType("express_retail")}
            />
            <div>
              <span className="block text-sm font-medium text-zinc-100">Autoservicio / Kiosco (Komanda Kiosk)</span>
              <span className="mt-0.5 block text-xs text-zinc-400">
                Venta rápida, códigos de barra, arqueo de caja y totem express.
              </span>
            </div>
          </label>
        </div>
      </div>

      {tenantType === "gastronomy" ? (
        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
          <div>
            <span className="block text-sm font-medium text-zinc-200">
              Tema del menú digital (QR)
            </span>
            <span className="block text-xs text-zinc-400">
              Elegí la presentación visual que verán tus clientes al escanear la carta.
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-950 p-3.5 transition hover:border-zinc-500">
              <input
                type="radio"
                name="menuTheme"
                value="classic"
                checked={menuTheme === "classic"}
                className="mt-0.5 accent-[var(--color-accent-tertiary)]"
                onChange={() => setMenuTheme("classic")}
              />
              <div>
                <span className="block text-sm font-medium text-zinc-100">Clásico</span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  Grilla tradicional con categorías, descripciones y tarjetas de platos.
                </span>
              </div>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-zinc-700 bg-zinc-950 p-3.5 transition hover:border-zinc-500">
              <input
                type="radio"
                name="menuTheme"
                value="reels"
                checked={menuTheme === "reels"}
                className="mt-0.5 accent-[var(--color-accent-tertiary)]"
                onChange={() => setMenuTheme("reels")}
              />
              <div>
                <span className="block text-sm font-medium text-zinc-100">Reels</span>
                <span className="mt-0.5 block text-xs text-zinc-400">
                  Experiencia vertical inmersiva a pantalla completa con videos y fotos dinámicas.
                </span>
              </div>
            </label>
          </div>
        </div>
      ) : null}
      <div className="grid gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <label className="grid gap-1">
          <span className="text-sm font-medium text-zinc-200">
            Webhook de Slack para cobros en efectivo (Komanda Kiosk)
          </span>
          <span className="text-xs text-zinc-400">
            URL de Incoming Webhook para notificar al mostrador cada vez que un cliente elija pagar en efectivo.
          </span>
          <input
            name="slackCashAlertWebhookUrl"
            type="url"
            defaultValue={settings.slackCashAlertWebhookUrl ?? ""}
            placeholder="https://hooks.slack.com/services/..."
            className={inputClass}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <span>Moneda: {settings.currency}</span>
        <span>Ventas: {settings.salesEnabled ? "activas" : "deshabilitadas"}</span>
        <label className="flex items-center gap-2">
          <input
            name="printingEnabled"
            type="checkbox"
            defaultChecked={settings.printingEnabled}
          />
          <span>Habilitar impresión</span>
        </label>
      </div>
      <button className="w-fit rounded-md bg-[var(--color-accent-secondary)] px-5 py-3 text-sm font-semibold text-[var(--color-accent-primary)] hover:bg-[var(--color-accent-tertiary)] transition-colors">
        Guardar configuración
      </button>
    </form>
  );
}
