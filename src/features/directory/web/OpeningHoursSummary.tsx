import {
  formatOpeningHoursLines,
  hasOpeningHours,
  type OpeningHours,
} from "@/features/tenancy/domain/opening-hours";

export function OpeningHoursSummary({
  openingHours,
}: {
  openingHours?: OpeningHours | null;
}) {
  if (!hasOpeningHours(openingHours)) {
    return <p className="text-xs text-[#c2c2cc]">Horarios no informados.</p>;
  }

  return (
    <dl className="divide-y divide-white/[0.08] tabular-nums">
      {formatOpeningHoursLines(openingHours).map((line) => (
        <div
          key={line.days}
          className="flex items-baseline justify-between gap-3 py-1 first:pt-0 last:pb-0"
        >
          <dt className="shrink-0 text-xs font-medium text-[#c2c2cc]">
            {line.days}
          </dt>
          <dd className="text-right text-xs font-semibold text-[#f4f3f1]">
            {line.schedule}
          </dd>
        </div>
      ))}
    </dl>
  );
}
