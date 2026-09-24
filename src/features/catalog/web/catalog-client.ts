/**
 * Cliente HTTP del backoffice de catálogo.
 *
 * Traduce las respuestas `application/problem+json` del backend a mensajes
 * accionables en español y normaliza entradas de usuario (precios) antes de
 * enviarlas, evitando los errores de validación más frecuentes.
 */

export class CatalogRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = "CatalogRequestError";
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  VALIDATION_FAILED:
    "Algún dato no es válido. Revisá los campos e intentá de nuevo.",
  CATALOG_CONFLICT:
    "No se pudo aplicar el cambio: el recurso fue modificado por otro operador o no cumple una regla del catálogo. Recargá la página e intentá de nuevo.",
  IDEMPOTENCY_KEY_REQUIRED: "Falta la clave de idempotencia de la operación.",
  RESOURCE_NOT_FOUND: "El recurso no existe o ya no está disponible.",
  INTERNAL_ERROR:
    "Error interno del servidor. Intentá de nuevo en unos segundos.",
};

const CONFLICT_DETAILS: Record<string, string> = {
  "Item category must be active.":
    "Publicá la categoría antes de publicar este producto.",
  "Item media must be ready.":
    "Esperá a que termine de procesarse la imagen o el video antes de publicar el producto.",
  "Item version conflict.":
    "El producto cambió desde que abriste la página. Recargá la página y volvé a intentar.",
  "Duplicate item name.":
    "Ya existe un producto activo con este nombre en este negocio.",
  "Duplicate barcode.":
    "Ya existe un producto con este código de barras en este negocio.",
  "Duplicate category name.":
    "Ya existe una categoría activa con este nombre.",
};

async function parseProblem(response: Response): Promise<CatalogRequestError> {
  let code: string | null = null;
  let detail: string | null = null;
  try {
    const body = (await response.json()) as { code?: string; detail?: string };
    code = typeof body.code === "string" ? body.code : null;
    detail = typeof body.detail === "string" ? body.detail : null;
  } catch {
    // Respuesta sin cuerpo JSON legible.
  }
  if (response.status === 409 && !code) {
    code = "CATALOG_CONFLICT";
  }
  const message =
    (code === "CATALOG_CONFLICT" && detail
      ? CONFLICT_DETAILS[detail]
      : undefined) ??
    (code ? ERROR_MESSAGES[code] : undefined) ??
    `No se pudo completar la operación (HTTP ${response.status}).`;
  return new CatalogRequestError(message, response.status, code);
}

/** Ejecuta un fetch y devuelve el JSON parseado o lanza CatalogRequestError. */
export async function catalogFetch<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new CatalogRequestError(
      "Sin conexión con el servidor. Verificá tu red e intentá de nuevo.",
      0,
      null,
    );
  }
  if (!response.ok) throw await parseProblem(response);
  if (response.status === 204) return null as T;
  return (await response.json()) as T;
}

export function catalogHeaders(version?: number): HeadersInit {
  return version === undefined
    ? { "Content-Type": "application/json" }
    : {
        "Content-Type": "application/merge-patch+json",
        "If-Match": String(version),
      };
}

/**
 * Normaliza un precio ingresado por el usuario al formato `NNNN.NN` que exige
 * el backend. Acepta "3500", "3500.5", "3500,50", "$ 3.500,50".
 * Devuelve null si el valor no representa un monto válido.
 */
export function normalizeMoneyInput(raw: string): string | null {
  const cleaned = raw.trim().replace(/^\$/, "").trim().replace(/\s/g, "");
  if (!cleaned) return null;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized: string;

  if (lastComma !== -1 && lastDot !== -1) {
    // Ambos separadores: el último es el decimal, el otro es de miles.
    normalized =
      lastComma > lastDot
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (lastComma !== -1) {
    // Solo comas: una única coma actúa como separador decimal.
    if (cleaned.indexOf(",") !== lastComma) return null;
    normalized = cleaned.replace(",", ".");
  } else if (lastDot !== -1) {
    // Solo puntos: grupos de 3 dígitos son miles ("12.000"); 1-2 son decimales.
    const parts = cleaned.split(".");
    const looksLikeThousands =
      parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
    normalized = looksLikeThousands ? parts.join("") : cleaned;
  } else {
    normalized = cleaned;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const [integerPart, decimals = ""] = normalized.split(".");
  if (integerPart.length > 10) return null;
  return `${integerPart}.${decimals.padEnd(2, "0")}`;
}
