type DateLike = string | null | undefined;

function normalizeDate(value: DateLike) {
  return (value ?? '').trim();
}

export function isDateRangeValid(startDate: DateLike, endDate: DateLike) {
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  if (!start || !end) return true;
  return start <= end;
}
