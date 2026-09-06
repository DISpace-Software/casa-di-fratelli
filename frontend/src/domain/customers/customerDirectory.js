export function getCustomerBirthDate(customer) {
  return String(customer.birthDate ?? customer.BirthDate ?? "").trim();
}

export function daysUntilBirthday(value, today) {
  const match = String(value || "").match(/^\d{4}-(\d{2})-(\d{2})(?:$|T)/);
  if (!match || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return Infinity;
  const [, month, day] = match.map(Number);
  const valid = new Date(Date.UTC(2000, month - 1, day));
  if (valid.getUTCMonth() !== month - 1 || valid.getUTCDate() !== day) return Infinity;
  const start = Date.parse(`${today}T00:00:00Z`);
  for (let year = Number(today.slice(0, 4)); year <= Number(today.slice(0, 4)) + 8; year += 1) {
    const next = new Date(Date.UTC(year, month - 1, day));
    if (next.getUTCMonth() === month - 1 && next.getTime() >= start) {
      return Math.round((next.getTime() - start) / 86400000);
    }
  }
  return Infinity;
}

export function searchCustomers(customers, query = "") {
  const search = query.trim().toLocaleLowerCase();
  if (!search) return [...customers];
  const digits = search.replace(/\D/g, "");
  return customers.filter((customer) => {
    const values = [customer.guestName ?? customer.GuestName, customer.phone ?? customer.Phone, customer.email ?? customer.Email];
    return values.some((value) => String(value || "").toLocaleLowerCase().includes(search)) ||
      (/^[+\d\s()-]+$/.test(search) && digits && String(values[1] || "").replace(/\D/g, "").includes(digits));
  });
}

export function sortCustomers(customers, sort, language, today) {
  return [...customers].sort((first, second) => {
    if (sort === "birthday") {
      const difference = daysUntilBirthday(getCustomerBirthDate(first), today) - daysUntilBirthday(getCustomerBirthDate(second), today);
      if (difference && !Number.isNaN(difference)) return difference;
    }
    if (sort === "new") return String(second.firstReservation || "").localeCompare(String(first.firstReservation || ""));
    if (sort === "recent") return String(second.lastReservation || "").localeCompare(String(first.lastReservation || ""));
    if (sort === "name" || sort === "birthday") return String(first.guestName || "").localeCompare(String(second.guestName || ""), language);
    return second.periodCount - first.periodCount || second.count - first.count;
  });
}

export function formatBirthdayEmailSentAt(value, language = "bg") {
  if (!value) return "";
  const raw = String(value).trim();
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw) ? `${raw}Z` : raw;
  const date = new Date(utc);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, {
    timeZone: "Europe/Sofia", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(date);
}
