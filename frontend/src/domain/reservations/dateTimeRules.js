import { RESERVATION_BUFFER_MINUTES } from "./tableConfig.js";

export function timeToMinutes(value) {
  const [hours, minutes] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function expandTimeValues(value) {
  return String(value || "")
    .split(",")
    .flatMap((part) => {
      const trimmed = part.trim();
      if (!trimmed) return [];

      if (trimmed.includes(" - ")) {
        const [startValue, endValue] = trimmed.split(" - ").map((item) => item.trim());
        const start = timeToMinutes(startValue);
        let end = timeToMinutes(endValue);
        if (start === null || end === null) return [];
        if (end < start) end += 24 * 60;

        const times = [];
        for (let minute = start; minute <= end; minute += 60) {
          times.push(minute % (24 * 60));
        }

        return times;
      }

      const minutes = timeToMinutes(trimmed);
      return minutes === null ? [] : [minutes];
    });
}

export function getTodayInputValue(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDateInputValueAfterDays(days, now = new Date()) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  return getTodayInputValue(date);
}

function parseLocalDate(dateValue) {
  const [year, month, day] = String(dateValue || "").split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return null;
  return new Date(year, month - 1, day);
}

export function getBookableReservationDates({ today, maxDate, closure, includeToday = true }) {
  const firstDate = parseLocalDate(today);
  const lastDate = parseLocalDate(maxDate);
  if (!firstDate || !lastDate || firstDate > lastDate) return [];

  const dates = [];
  const cursor = new Date(firstDate);

  while (cursor <= lastDate) {
    const value = getTodayInputValue(cursor);
    const isTodayUnavailable = value === today && !includeToday;
    const isClosed = Boolean(
      closure?.enabled &&
      closure.startDate &&
      closure.endDate &&
      value >= closure.startDate &&
      value <= closure.endDate
    );

    if (!isTodayUnavailable && !isClosed) dates.push(value);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

export function isDateBeyondReservationWindow(dateValue, maxDays = 10, now = new Date()) {
  if (!dateValue) return false;
  return dateValue > getDateInputValueAfterDays(maxDays, now);
}

export function isPastTimeForDate(dateValue, timeValue, now = new Date(), minimumLeadMinutes = 0) {
  if (!dateValue || !timeValue) return false;

  const today = getTodayInputValue(now);
  if (dateValue < today) return true;
  if (dateValue > today) return false;

  const [hours, minutes] = timeValue.split(":").map(Number);
  const selected = new Date(now);
  selected.setHours(hours, minutes, 0, 0);
  if (hours <= 3 && now.getHours() >= 10) {
    selected.setDate(selected.getDate() + 1);
  }

  return selected.getTime() - now.getTime() <= minimumLeadMinutes * 60 * 1000;
}

export function getAvailableReservationTimesForDate(times, dateValue, now = new Date(), minimumLeadMinutes = 0) {
  if (!dateValue) return times;
  return times.filter((time) => !isPastTimeForDate(dateValue, time, now, minimumLeadMinutes));
}

export function isWithinReservationBuffer(
  firstTime,
  secondTime,
  bufferMinutes = RESERVATION_BUFFER_MINUTES
) {
  const firstValues = expandTimeValues(firstTime);
  const secondValues = expandTimeValues(secondTime);

  if (firstValues.length === 0 || secondValues.length === 0) return firstTime === secondTime;

  return firstValues.some((first) =>
    secondValues.some((second) => {
      const distance = Math.abs(first - second);
      const dayAwareDistance = Math.min(distance, 24 * 60 - distance);

      return dayAwareDistance < bufferMinutes;
    })
  );
}
