import {
  hasOpeningHours,
  type OpeningHours,
  type Weekday,
} from "@/features/tenancy/domain/opening-hours";

export class OrderSchedulingError extends Error {
  readonly code = "INVALID_SCHEDULED_TIME";
  constructor(message: string) {
    super(message);
    this.name = "OrderSchedulingError";
  }
}

const WEEKDAY_BY_EN_SHORT: Record<string, Weekday> = {
  Mon: "monday",
  Tue: "tuesday",
  Wed: "wednesday",
  Thu: "thursday",
  Fri: "friday",
  Sat: "saturday",
  Sun: "sunday",
};

const WEEKDAY_LABEL_ES: Record<Weekday, string> = {
  monday: "Lun",
  tuesday: "Mar",
  wednesday: "Mié",
  thursday: "Jue",
  friday: "Vie",
  saturday: "Sáb",
  sunday: "Dom",
};

function getZonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  const weekdayShort = map.weekday ?? "Mon";
  const weekday = WEEKDAY_BY_EN_SHORT[weekdayShort] ?? "monday";
  const year = map.year ?? "2026";
  const month = map.month ?? "01";
  const day = map.day ?? "01";
  const hour = map.hour === "24" ? "00" : (map.hour ?? "00");
  const minute = map.minute ?? "00";
  return {
    weekday,
    dateKey: `${year}-${month}-${day}`,
    dayMonth: `${day}/${month}`,
    hhmm: `${hour}:${minute}`,
  };
}

export function validateScheduledPickupTime(
  scheduledForInput: string | Date | null | undefined,
  options?: {
    now?: Date;
    openingHours?: OpeningHours | null;
    timezone?: string;
  },
): Date | null {
  if (
    scheduledForInput === null ||
    scheduledForInput === undefined ||
    (typeof scheduledForInput === "string" && scheduledForInput.trim() === "")
  ) {
    return null;
  }

  const parsed =
    scheduledForInput instanceof Date
      ? scheduledForInput
      : new Date(scheduledForInput);

  if (Number.isNaN(parsed.getTime())) {
    throw new OrderSchedulingError("La fecha y hora programada es inválida.");
  }

  const now = options?.now ?? new Date();
  const minTimeMs = now.getTime() + 10 * 60 * 1000;
  const maxTimeMs = now.getTime() + 7 * 24 * 60 * 60 * 1000;

  if (parsed.getTime() < minTimeMs) {
    throw new OrderSchedulingError(
      "El horario programado debe ser al menos 15 minutos en el futuro.",
    );
  }

  if (parsed.getTime() > maxTimeMs) {
    throw new OrderSchedulingError(
      "Solo podés programar pedidos hasta con 7 días de anticipación.",
    );
  }

  const openingHours = options?.openingHours;
  if (openingHours && hasOpeningHours(openingHours)) {
    const timezone = options?.timezone || "America/Argentina/Buenos_Aires";
    const { weekday, hhmm } = getZonedParts(parsed, timezone);
    const dayRanges = openingHours[weekday] ?? [];
    const inAnyRange = dayRanges.some(
      (range) => hhmm >= range.open && hhmm <= range.close,
    );
    if (!inAnyRange) {
      throw new OrderSchedulingError(
        "El horario elegido está fuera del horario de atención del comercio.",
      );
    }
  }

  return parsed;
}

export type ScheduledDayGroup = {
  dateKey: string;
  label: string;
  slots: Array<{
    label: string;
    iso: string;
  }>;
};

export function generateScheduledDaysAndSlots(options?: {
  now?: Date;
  openingHours?: OpeningHours | null;
  timezone?: string;
  daysAhead?: number;
}): ScheduledDayGroup[] {
  const now = options?.now ?? new Date();
  const timezone = options?.timezone || "America/Argentina/Buenos_Aires";
  const openingHours = options?.openingHours;
  const hasCustomHours = Boolean(openingHours && hasOpeningHours(openingHours));
  const maxDays = options?.daysAhead ?? 3;

  const startMs = Math.ceil((now.getTime() + 20 * 60 * 1000) / (15 * 60 * 1000)) * (15 * 60 * 1000);
  const endMs = now.getTime() + maxDays * 24 * 60 * 60 * 1000;

  const todayParts = getZonedParts(now, timezone);
  const tomorrowParts = getZonedParts(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    timezone,
  );

  const groupsMap = new Map<string, ScheduledDayGroup>();

  for (let ms = startMs; ms <= endMs; ms += 15 * 60 * 1000) {
    const slotDate = new Date(ms);
    const parts = getZonedParts(slotDate, timezone);

    if (hasCustomHours && openingHours) {
      const ranges = openingHours[parts.weekday] ?? [];
      const matches = ranges.some(
        (range) => parts.hhmm >= range.open && parts.hhmm <= range.close,
      );
      if (!matches) continue;
    } else {
      if (parts.hhmm < "09:00" || parts.hhmm > "23:30") continue;
    }

    let group = groupsMap.get(parts.dateKey);
    if (!group) {
      if (groupsMap.size >= maxDays) continue;
      const dayLabel =
        parts.dateKey === todayParts.dateKey
          ? "Hoy"
          : parts.dateKey === tomorrowParts.dateKey
            ? "Mañana"
            : `${WEEKDAY_LABEL_ES[parts.weekday]} ${parts.dayMonth}`;
      group = {
        dateKey: parts.dateKey,
        label: dayLabel,
        slots: [],
      };
      groupsMap.set(parts.dateKey, group);
    }

    group.slots.push({
      label: parts.hhmm,
      iso: slotDate.toISOString(),
    });
  }

  return Array.from(groupsMap.values()).filter((g) => g.slots.length > 0);
}

export function formatScheduledForDisplay(
  isoOrDate: string | Date | null | undefined,
  options?: {
    now?: Date;
    timezone?: string;
  },
): string | null {
  if (!isoOrDate) return null;
  const parsed = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  if (Number.isNaN(parsed.getTime())) return null;

  const now = options?.now ?? new Date();
  const timezone = options?.timezone || "America/Argentina/Buenos_Aires";
  const target = getZonedParts(parsed, timezone);
  const today = getZonedParts(now, timezone);
  const tomorrow = getZonedParts(
    new Date(now.getTime() + 24 * 60 * 60 * 1000),
    timezone,
  );

  if (target.dateKey === today.dateKey) {
    return `Hoy ${target.hhmm}`;
  }
  if (target.dateKey === tomorrow.dateKey) {
    return `Mañana ${target.hhmm}`;
  }
  return `${WEEKDAY_LABEL_ES[target.weekday]} ${target.dayMonth} · ${target.hhmm}`;
}
