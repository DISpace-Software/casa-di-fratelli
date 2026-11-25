
export function toLocalDateTimeInputValue(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function formatEuroAmount(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

export function formatBirthday(value, language) {
  if (!value) return "—";

  const [, month, day] = String(value).split("-");
  if (!month || !day) return value;

  if (language === "bg") {
    return `${day}.${month}`;
  }

  const monthLabel = {
    "01": "January",
    "02": "February",
    "03": "March",
    "04": "April",
    "05": "May",
    "06": "June",
    "07": "July",
    "08": "August",
    "09": "September",
    "10": "October",
    "11": "November",
    "12": "December",
  }[month] || month;
  return `${Number(day)} ${monthLabel}`;
}

export function capitalize(value) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

