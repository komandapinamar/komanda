import { z } from "zod";

export const WEEKDAYS = [
  { key: "monday", label: "Lunes", shortLabel: "Lun" },
  { key: "tuesday", label: "Martes", shortLabel: "Mar" },
  { key: "wednesday", label: "Miércoles", shortLabel: "Mié" },
  { key: "thursday", label: "Jueves", shortLabel: "Jue" },
  { key: "friday", label: "Viernes", shortLabel: "Vie" },
  { key: "saturday", label: "Sábado", shortLabel: "Sáb" },
  { key: "sunday", label: "Domingo", shortLabel: "Dom" },
] as const;

export type Weekday = (typeof WEEKDAYS)[number]["key"];

export type OpeningHoursRange = {
  open: string;
  close: string;
};

export type OpeningHours = Partial<Record<Weekday, OpeningHoursRange[]>>;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const openingHoursRangeSchema = z
  .object({
    open: z
      .string()
      .regex(TIME_PATTERN, "Usá el formato HH:mm para la apertura."),
    close: z
      .string()
      .regex(TIME_PATTERN, "Usá el formato HH:mm para el cierre."),
  })
  .strict();

const dayRangeListSchema = z.array(openingHoursRangeSchema).max(8);

export const openingHoursSchema = z
  .object({
    monday: dayRangeListSchema.optional(),
    tuesday: dayRangeListSchema.optional(),
    wednesday: dayRangeListSchema.optional(),
    thursday: dayRangeListSchema.optional(),
    friday: dayRangeListSchema.optional(),
    saturday: dayRangeListSchema.optional(),
    sunday: dayRangeListSchema.optional(),
  })
  .strict();

export function normalizeOpeningHours(value: unknown): OpeningHours {
  const parsed = openingHoursSchema.safeParse(value);
  if (!parsed.success) return {};

  const normalized: OpeningHours = {};
  for (const { key } of WEEKDAYS) {
    const ranges = parsed.data[key];
    if (!ranges || ranges.length === 0) continue;
    normalized[key] = [...ranges].sort((a, b) => a.open.localeCompare(b.open));
  }
  return normalized;
}

export function hasOpeningHours(value: unknown): boolean {
  return Object.keys(normalizeOpeningHours(value)).length > 0;
}

function formatRange(range: OpeningHoursRange) {
  return `${range.open} a ${range.close}`;
}

export type OpeningHoursLine = {
  days: string;
  schedule: string;
};

export function formatOpeningHoursLines(value: unknown): OpeningHoursLine[] {
  const hours = normalizeOpeningHours(value);
  const scheduleOf = (day: Weekday) => {
    const ranges = hours[day] ?? [];
    return ranges.length > 0 ? ranges.map(formatRange).join(" · ") : "Cerrado";
  };

  const lines: OpeningHoursLine[] = [];
  let index = 0;
  while (index < WEEKDAYS.length) {
    const schedule = scheduleOf(WEEKDAYS[index].key);
    let last = index;
    while (
      last + 1 < WEEKDAYS.length &&
      scheduleOf(WEEKDAYS[last + 1].key) === schedule
    ) {
      last += 1;
    }
    const firstLabel = WEEKDAYS[index].shortLabel;
    const lastLabel = WEEKDAYS[last].shortLabel;
    lines.push({
      days: index === last ? firstLabel : `${firstLabel} a ${lastLabel}`,
      schedule,
    });
    index = last + 1;
  }
  return lines;
}
