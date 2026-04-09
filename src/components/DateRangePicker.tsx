import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { isDateRangeValid } from '../lib/dateRange';

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
  const start = normalizeDate(startDate);
  const end = normalizeDate(endDate);
  const isValid = isDateRangeValid(start, end);
  const isDisabled = disabled || loading;

  useEffect(() => {
    onValidityChange?.(isValid);
  }, [isValid, onValidityChange]);

  return (
    <div className={joinClasses('space-y-2', className)} aria-busy={loading}>
      <div className={joinClasses('grid grid-cols-1 gap-3 md:grid-cols-2', layoutClassName)}>
        <label className={joinClasses('rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-600 shadow-inner shadow-white/50', fieldClassName)}>
          <span className={joinClasses('text-xs font-semibold uppercase tracking-wide text-gray-500', labelClassName)}>{startLabel}</span>
          <div className={joinClasses('mt-2 inline-flex w-full items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5', inputWrapperClassName)}>
            {startAdornment}
            <input
              type="date"
              value={start}
              onChange={(event) => onStartDateChange(event.target.value)}
              className={joinClasses('w-full bg-transparent text-sm text-gray-800 outline-none transition focus:ring-0 disabled:cursor-not-allowed', inputClassName)}
              max={end || undefined}
              disabled={isDisabled}
              required={required}
              aria-label={startAriaLabel ?? startLabel}
            />
          </div>
        </label>

        <label className={joinClasses('rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-3 text-sm text-gray-600 shadow-inner shadow-white/50', fieldClassName)}>
          <span className={joinClasses('text-xs font-semibold uppercase tracking-wide text-gray-500', labelClassName)}>{endLabel}</span>
          <div className={joinClasses('mt-2 inline-flex w-full items-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2.5', inputWrapperClassName)}>
            {endAdornment}
            <input
              type="date"
              value={end}
              onChange={(event) => onEndDateChange(event.target.value)}
              className={joinClasses('w-full bg-transparent text-sm text-gray-800 outline-none transition focus:ring-0 disabled:cursor-not-allowed', inputClassName)}
              min={start || undefined}
              disabled={isDisabled}
              required={required}
              aria-label={endAriaLabel ?? endLabel}
            />
          </div>
        </label>
      </div>

      {showValidationMessage && !isValid ? (
        <p className={joinClasses('text-xs font-semibold uppercase tracking-[0.12em] text-amber-700', helperClassName)}>
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
