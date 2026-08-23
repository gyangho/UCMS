import { useEffect } from "react";

interface TenMinuteDateTimeInputProps {
  disabled?: boolean;
  label: string;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const MINUTES = ["00", "10", "20", "30", "40", "50"];

// 2026-08-23: Native datetime-local pickers may still expose every minute despite step=600.
export function TenMinuteDateTimeInput({ disabled = false, label, onChange, required = false, value }: TenMinuteDateTimeInputProps) {
  const normalizedValue = normalizeTenMinuteValue(value);
  const date = normalizedValue.slice(0, 10);
  const hour = normalizedValue.slice(11, 13) || "00";
  const minute = normalizedValue.slice(14, 16) || "00";

  useEffect(() => {
    if (value && value !== normalizedValue) onChange(normalizedValue);
  }, [normalizedValue, onChange, value]);

  function emit(nextDate: string, nextHour = hour, nextMinute = minute) {
    onChange(nextDate ? `${nextDate}T${nextHour}:${nextMinute}` : "");
  }

  return (
    <fieldset className="ten-minute-datetime" disabled={disabled}>
      <legend>{label}</legend>
      <input
        aria-label={`${label} 날짜`}
        required={required}
        type="date"
        value={date}
        onChange={(event) => emit(event.target.value)}
      />
      <select aria-label={`${label} 시`} value={hour} onChange={(event) => emit(date, event.target.value, minute)}>
        {HOURS.map((option) => <option key={option} value={option}>{option}시</option>)}
      </select>
      <select aria-label={`${label} 분`} value={minute} onChange={(event) => emit(date, hour, event.target.value)}>
        {MINUTES.map((option) => <option key={option} value={option}>{option}분</option>)}
      </select>
    </fieldset>
  );
}

function normalizeTenMinuteValue(value: string) {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/);
  if (!match) return "";
  const local = new Date(`${match[1]}T${match[2]}:${match[3]}:00`);
  if (Number.isNaN(local.getTime())) return "";
  local.setMinutes(Math.round(local.getMinutes() / 10) * 10, 0, 0);
  const date = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
  return `${date}T${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`;
}
