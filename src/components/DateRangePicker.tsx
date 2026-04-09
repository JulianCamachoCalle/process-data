import { useEffect } from 'react';
import type { ReactNode } from 'react';
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
  showPresets = true,
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
  const presets = getDateRangePresets();

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
                }}
                disabled={isDisabled}
                className={joinClasses(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] transition',
                  isSelected
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400 hover:text-gray-800',
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

      {showValidationMessage && !isValid ? (
        <p className={joinClasses('text-xs font-semibold uppercase tracking-[0.12em] text-amber-700', helperClassName)}>
          {validationMessage}
        </p>
      ) : null}
    </div>
  );
}
