import { z } from "zod";

const coordinate = (label: string, min: number, max: number) =>
  z
    .number({ message: `${label} debe ser un número` })
    .finite(`${label} debe ser finito`)
    .min(min, `${label} está fuera de rango`)
    .max(max, `${label} está fuera de rango`)
    .refine((value) => Math.abs(value - Number(value.toFixed(6))) < Number.EPSILON, {
      message: `${label} admite como máximo seis decimales`,
    });

export const locationSchema = z
  .object({
    lat: coordinate("La latitud", -90, 90),
    lng: coordinate("La longitud", -180, 180),
    formattedAddress: z.string().trim().max(500).nullable().optional(),
    geocoderProvider: z.literal("photon").optional(),
  })
  .strict();

export type LocationAddress = z.infer<typeof locationSchema>;

export function isValidLocation(value: unknown): value is LocationAddress {
  return locationSchema.safeParse(value).success;
}
