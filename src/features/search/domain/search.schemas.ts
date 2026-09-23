import { z } from "zod";
import { SEARCH_CONFIG } from "./search.rules";

export const searchQuerySchema = z.object({
  q: z
    .string()
    .max(
      SEARCH_CONFIG.MAX_QUERY_LENGTH,
      `Query length cannot exceed ${SEARCH_CONFIG.MAX_QUERY_LENGTH} characters.`,
    )
    .default(""),
  productsLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_CONFIG.MAX_LIMIT)
    .default(SEARCH_CONFIG.DEFAULT_PRODUCTS_LIMIT),
  businessesLimit: z.coerce
    .number()
    .int()
    .min(1)
    .max(SEARCH_CONFIG.MAX_LIMIT)
    .default(SEARCH_CONFIG.DEFAULT_BUSINESSES_LIMIT),
});

export type SearchQueryParams = z.infer<typeof searchQuerySchema>;

export const searchProductResultSchema = z.object({
  itemId: z.string().uuid(),
  name: z.string(),
  price: z.string(),
  currency: z.string(),
  category: z.string(),
  imageUrl: z.string().nullable(),
  tenant: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    name: z.string(),
  }),
  storefrontPath: z.string(),
});

export type SearchProductResult = z.infer<typeof searchProductResultSchema>;

export const searchBusinessResultSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  currency: z.string(),
  locationName: z.string().nullable(),
  locationAddress: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  mapQuery: z.string(),
  categoriesCount: z.number(),
});

export type SearchBusinessResult = z.infer<typeof searchBusinessResultSchema>;

export const searchResultDataSchema = z.object({
  query: z.string(),
  products: z.array(searchProductResultSchema),
  businesses: z.array(searchBusinessResultSchema),
});

export type SearchResultData = z.infer<typeof searchResultDataSchema>;

export const searchResponseEnvelopeSchema = z.object({
  success: z.boolean(),
  data: searchResultDataSchema.nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});

export type SearchResponseEnvelope = z.infer<
  typeof searchResponseEnvelopeSchema
>;
