type DateLike = string | null | undefined;

export const DATE_RANGE_PRESET_KEYS = ['today', 'last7Days', 'lastMonth'] as const;

export type DateRangePresetKey = (typeof DATE_RANGE_PRESET_KEYS)[number];

export type DateRangeValue = {
  startDate: string;
  endDate: string;
};

export type DateRangePreset = DateRangeValue & {
  key: DateRangePresetKey;
  label: string;
};

function normalizeDate(value: DateLike) {
  return (value ?? '').trim();
}

function formatLocalDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractDays(baseDate: Date, days: number) {
  const nextDate = new Date(baseDate);
  nextDate.setDate(nextDate.getDate() - days);
  return nextDate;
}

export function getDateRangePresetValues(referenceDate = new Date()): Record<DateRangePresetKey, DateRangeValue> {
  const endDate = formatLocalDate(referenceDate);

  return {
    today: {
      startDate: endDate,
      endDate,
    },
    last7Days: {
      startDate: formatLocalDate(subtractDays(referenceDate, 6)),
      endDate,
    },
    lastMonth: {
      startDate: formatLocalDate(subtractDays(referenceDate, 29)),
      endDate,
    },
  };
}

export function getDateRangePresets(referenceDate = new Date()): DateRangePreset[] {
  const values = getDateRangePresetValues(referenceDate);

  return [
    {
      key: 'today',
      label: 'Hoy',
      ...values.today,
    },
    {
      key: 'last7Days',
      label: 'Últimos 7 días',
      ...values.last7Days,
    },
    {
      key: 'lastMonth',
      label: 'Último mes',
      ...values.lastMonth,
    },
  ];
}

export function isDateRangeValid(startDate: DateLike, endDate: DateLike) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return true;
  return start <= end;
}
