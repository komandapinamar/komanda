export const SEARCH_CONFIG = {
  MIN_QUERY_LENGTH: 1,
  MAX_QUERY_LENGTH: 80,
  DEFAULT_PRODUCTS_LIMIT: 10,
  DEFAULT_BUSINESSES_LIMIT: 10,
  MAX_LIMIT: 50,
  MIN_SIMILARITY_THRESHOLD: 0.25,
  RATE_LIMIT_MAX_REQUESTS: 30,
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_RETRY_AFTER_SECONDS: 60,
} as const;

export class InvalidItemTenantAssociationError extends Error {
  constructor(message = "Item does not belong to the specified tenant.") {
    super(message);
    this.name = "InvalidItemTenantAssociationError";
  }
}

/**
 * Sanitizes and normalizes the search query by trimming whitespace
 * and removing non-printable control characters.
 */
export function sanitizeSearchQuery(query: unknown): string {
  if (typeof query !== "string") {
    return "";
  }
  return query
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .trim()
    .slice(0, SEARCH_CONFIG.MAX_QUERY_LENGTH);
}

/**
 * Builds the canonical relative storefront path with anchor to a specific item.
 */
export function buildStorefrontProductAnchor(itemId: string): string {
  if (!itemId || typeof itemId !== "string" || itemId.trim().length === 0) {
    throw new Error("A valid itemId is required to build a storefront anchor.");
  }
  return `?item=${encodeURIComponent(itemId.trim())}`;
}

/**
 * Invariant check ensuring an item cannot be emitted under an incorrect tenant.
 */
export function assertValidItemTenant(
  itemId: string,
  tenantId: string,
  itemTenantId: string,
): void {
  if (tenantId !== itemTenantId) {
    throw new InvalidItemTenantAssociationError(
      `Item ${itemId} belongs to tenant ${itemTenantId}, not ${tenantId}.`,
    );
  }
}
