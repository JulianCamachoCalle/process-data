import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { DateRangePreset } from '../lib/dateRange';
import { getDateRangePresets, isDateRangeValid } from '../lib/dateRange';

type DateLike = string | null | undefined;

export type DateRangePickerProps = {
  startDate: DateLike;
  endDate: DateLike;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  startLabel?: string;
  endLabel?: string;
  startAriaLabel?: string;
  endAriaLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  showValidationMessage?: boolean;
  validationMessage?: string;
  onValidityChange?: (isValid: boolean) => void;
  showPresets?: boolean;
  onPresetApply?: (preset: DateRangePreset) => void;
  className?: string;
  layoutClassName?: string;
  fieldClassName?: string;
  labelClassName?: string;
  inputWrapperClassName?: string;
  inputClassName?: string;
  helperClassName?: string;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
};

function joinClasses(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function normalizeDate(value: DateLike) {
  return (value ?? '').trim();
}

function formatDateForDisplay(value: string) {
  if (!value) return '—';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function parseIsoDate(value: string) {
  const [yearValue, monthValue, dayValue] = value.split('-').map(Number);
  if (!yearValue || !monthValue || !dayValue) return null;
  return new Date(yearValue, monthValue - 1, dayValue);
}

function formatDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value: Date, delta: number) {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function getMonthDaysGrid(monthDate: Date) {
  const firstDay = startOfMonth(monthDate);
  const firstWeekDayIndex = firstDay.getDay();
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const cells: Array<Date | null> = [];

  for (let index = 0; index < firstWeekDayIndex; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}

const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatMonthLabel(monthDate: Date) {
  return monthDate.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });
}

export function DateRangePicker({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  startLabel = 'Fecha inicio',
  endLabel = 'Fecha fin',
  startAriaLabel,
  endAriaLabel,
  disabled = false,
  loading = false,
  required = false,
  showValidationMessage = true,
  validationMessage = 'La fecha de inicio no puede ser mayor que la fecha de fin.',
  onValidityChange,
  showPresets = true,
  onPresetApply,
  className,
  layoutClassName,
  fieldClassName,
  labelClassName,
  inputWrapperClassName,
  inputClassName,
  helperClassName,
  startAdornment,
  endAdornment,
}: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(new Date()));
  const [rangeAnchor, setRangeAnchor] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  const isValid = isDateRangeValid(start, end);
  const isDisabled = disabled || loading;
  const presets = getDateRangePresets();

  const startFromProps = useMemo(() => (start ? parseIsoDate(start) : null), [start]);
  const endFromProps = useMemo(() => (end ? parseIsoDate(end) : null), [end]);

  const effectiveStart = rangeAnchor ?? start;
  const effectiveEnd = rangeAnchor ? rangeAnchor : end;

  const startKey = effectiveStart || '';
  const endKey = effectiveEnd || '';

  const orderedRange = useMemo(() => {
    if (!startKey && !endKey) return null;
    if (!startKey) return { start: endKey, end: endKey };
    if (!endKey) return { start: startKey, end: startKey };
    return startKey <= endKey ? { start: startKey, end: endKey } : { start: endKey, end: startKey };
  }, [endKey, startKey]);

  const monthCells = useMemo(() => getMonthDaysGrid(displayMonth), [displayMonth]);

  const triggerLabel = useMemo(() => {
    if (!start && !end) return `${startLabel} — ${endLabel}`;
    return `${formatDateForDisplay(start)} — ${formatDateForDisplay(end)}`;
  }, [end, endLabel, start, startLabel]);

  const calendarAriaLabel = startAriaLabel ?? endAriaLabel ?? 'Calendario de rango de fechas';

  // Mantener props de API pública sin romper contratos existentes.
  void required;
  void startAdornment;
  void endAdornment;
  void inputClassName;

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleOutsidePointer = (event: MouseEvent | TouchEvent) => {
      const targetNode = event.target;
      if (!targetNode || !(targetNode instanceof Node)) return;
      if (!rootRef.current?.contains(targetNode)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointer);
    document.addEventListener('touchstart', handleOutsidePointer, { passive: true });
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleOutsidePointer);
      document.removeEventListener('touchstart', handleOutsidePointer);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleToggleOpen = () => {
    setIsOpen((currentValue) => {
      const nextValue = !currentValue;
      if (nextValue) {
        const monthSource = startFromProps ?? endFromProps ?? new Date();
        setDisplayMonth(startOfMonth(monthSource));
        setRangeAnchor(null);
      }
      return nextValue;
    });
  };

  const handleDayClick = (dayDate: Date) => {
    if (isDisabled) return;
    const dayKey = formatDateKey(dayDate);

    if (!rangeAnchor) {
      setRangeAnchor(dayKey);
      return;
    }

    const nextStart = rangeAnchor <= dayKey ? rangeAnchor : dayKey;
    const nextEnd = rangeAnchor <= dayKey ? dayKey : rangeAnchor;

    onStartDateChange(nextStart);
    onEndDateChange(nextEnd);
    setRangeAnchor(null);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className={joinClasses('space-y-2', className)} aria-busy={loading}>
      {showPresets ? (
        <div className="flex flex-wrap items-center gap-2" aria-label="Presets de rango de fechas">
          {presets.map((preset) => {
            const isSelected = start === preset.startDate && end === preset.endDate;

            return (
              <button
                key={preset.key}
                type="button"
                onClick={() => {
                  onStartDateChange(preset.startDate);
                  onEndDateChange(preset.endDate);
                  onPresetApply?.(preset);
                }}
                disabled={isDisabled}
                className={joinClasses(
                  'rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition',
                  isSelected
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-red-300 hover:text-red-700',
                  isDisabled && 'cursor-not-allowed opacity-60 hover:border-gray-300 hover:text-gray-600'
                )}
                aria-pressed={isSelected}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="relative">
        <button
          type="button"
          onClick={handleToggleOpen}
          disabled={isDisabled}
          className={joinClasses(
            'inline-flex min-h-[42px] w-full items-center justify-between gap-3 rounded-xl border border-gray-300 bg-white px-3 py-2 text-left text-sm font-medium text-gray-800 transition',
            isOpen ? 'border-red-400 ring-2 ring-red-100' : 'hover:border-red-300',
            isDisabled && 'cursor-not-allowed opacity-60 hover:border-gray-300'
          )}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label="Selector de rango de fechas"
        >
          <span className="inline-flex flex-col leading-tight">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">Rango de fechas</span>
            <span>{triggerLabel}</span>
          </span>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">Editar</span>
        </button>

        {isOpen ? (
          <div className="absolute inset-x-0 z-30 mt-2 w-full rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_24px_52px_-36px_rgba(15,23,42,0.95)]">
            <div className={joinClasses('space-y-3', layoutClassName)}>
              <div className={joinClasses('rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-sm text-gray-600', fieldClassName)}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDisplayMonth((monthValue) => addMonths(monthValue, -1))}
                    className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-600 transition hover:border-red-300 hover:text-red-700"
                    aria-label="Mes anterior"
                    disabled={isDisabled}
                  >
                    ←
                  </button>
                  <p className={joinClasses('text-xs font-semibold uppercase tracking-[0.1em] text-gray-600', labelClassName)}>
                    {formatMonthLabel(displayMonth)}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDisplayMonth((monthValue) => addMonths(monthValue, 1))}
                    className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg border border-gray-300 bg-white px-2 text-sm font-semibold text-gray-600 transition hover:border-red-300 hover:text-red-700"
                    aria-label="Mes siguiente"
                    disabled={isDisabled}
                  >
                    →
                  </button>
                </div>

                <div className={joinClasses('rounded-xl border border-gray-200 bg-white p-2', inputWrapperClassName)} role="group" aria-label={calendarAriaLabel}>
                  <div className="mb-1 grid grid-cols-7 gap-1">
                    {WEEKDAY_LABELS.map((weekdayLabel) => (
                      <span key={weekdayLabel} className="text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                        {weekdayLabel}
                      </span>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {monthCells.map((dayDate, index) => {
                      if (!dayDate) {
                        return <span key={`empty-${index}`} className="h-9" aria-hidden="true" />;
                      }

                      const dayKey = formatDateKey(dayDate);
                      const isRangeStart = orderedRange?.start === dayKey;
                      const isRangeEnd = orderedRange?.end === dayKey;
                      const isInRange = orderedRange ? dayKey >= orderedRange.start && dayKey <= orderedRange.end : false;
                      const isSingleDayRange = isRangeStart && isRangeEnd;

                      return (
                        <button
                          key={dayKey}
                          type="button"
                          onClick={() => handleDayClick(dayDate)}
                          disabled={isDisabled}
                          className={joinClasses(
                            'h-8 rounded-lg text-xs font-semibold transition',
                            isSingleDayRange && 'bg-red-600 text-white',
                            !isSingleDayRange && isInRange && 'bg-red-50 text-red-700',
                            !isInRange && 'text-gray-700 hover:bg-red-50 hover:text-red-700',
                            (isRangeStart || isRangeEnd) && !isSingleDayRange && 'bg-red-600 text-white'
                          )}
                          aria-label={`Seleccionar ${formatDateForDisplay(dayKey)}`}
                        >
                          {dayDate.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
              >
                Listo
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {showValidationMessage && !isValid ? (
        <p className={joinClasses('text-xs font-semibold uppercase tracking-[0.12em] text-amber-700', helperClassName)}>
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
