import { adminLocalText } from '../../i18n/adminText.js';
import { adminReservationTimes } from '../../domain/reservations/tableConfig';
import { getLiveReservationCandidates, getReservationMinutesFromNow } from '../../domain/adminMap/liveReservations';

export function localizeReservationSaveError(message, language = "bg") {
  const normalized = String(message || "").trim();
  if (!normalized) {
    return adminLocalText(language, "Резервацията не е запазена. Проверете данните или заетостта и опитайте отново.", "Reservation was not saved. Check the details or availability and try again.", "Резервация не сохранена. Проверьте данные или доступность и повторите.");
  }

  const translations = {
    "The selected tables do not have enough seats.": [
      "Избраните маси нямат достатъчно места за този брой гости.",
      "The selected tables do not have enough seats for this number of guests.",
      "У выбранных столов недостаточно мест для такого количества гостей.",
    ],
    "One or more selected tables are reserved less than three hours from this time.": [
      "Една или повече избрани маси са заети в рамките на три часа от този час.",
      "One or more selected tables are reserved less than three hours from this time.",
      "Один или несколько выбранных столов заняты в пределах трёх часов от этого времени.",
    ],
    "Reservation date or time has already passed.": [
      "Датата или часът на резервацията вече са минали.",
      "Reservation date or time has already passed.",
      "Дата или время резервации уже прошли.",
    ],
    "Admin reservations are available until 23:00.": [
      "Административните резервации са възможни до 23:00.",
      "Admin reservations are available until 23:00.",
      "Административные резервации доступны до 23:00.",
    ],
    "One or more selected tables are not active.": [
      "Една или повече избрани маси не са активни.",
      "One or more selected tables are not active.",
      "Один или несколько выбранных столов не активны.",
    ],
    "Invalid email address.": [
      "Невалиден имейл адрес.",
      "Invalid email address.",
      "Неверный email адрес.",
    ],
  };

  const translated = translations[normalized];
  if (!translated) return normalized;
  if (language === "en") return translated[1];
  if (language === "ru") return translated[2];
  return translated[0];
}

export function getNextAdminReservationTime(now = new Date()) {
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return adminReservationTimes.find((time) => {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes >= minutesNow + 15;
  }) || adminReservationTimes[0] || "10:00";
}

export function buildLiveReservationsByTable(reservations, now = new Date()) {
  const byTable = new Map();

  getLiveReservationCandidates(reservations, now).forEach((reservation) => {
    reservation.tableIds.forEach((tableId) => {
      if (!byTable.has(tableId)) {
        byTable.set(tableId, reservation);
      }
    });
  });

  return byTable;
}

export function formatReservationLeadTime(minutes, language = "bg") {
  const value = Math.max(0, Math.round(Number(minutes || 0)));
  const hours = Math.floor(value / 60);
  const restMinutes = value % 60;

  if (language === "bg") {
    if (hours > 0 && restMinutes > 0) {
      return `след ${hours} ${hours === 1 ? "час" : "часа"} и ${restMinutes} ${restMinutes === 1 ? "минута" : "минути"}`;
    }
    if (hours > 0) return `след ${hours} ${hours === 1 ? "час" : "часа"}`;
    return `след ${restMinutes} ${restMinutes === 1 ? "минута" : "минути"}`;
  }

  if (hours > 0 && restMinutes > 0) {
    return `in ${hours} ${hours === 1 ? "hour" : "hours"} and ${restMinutes} ${restMinutes === 1 ? "minute" : "minutes"}`;
  }
  if (hours > 0) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return `in ${restMinutes} ${restMinutes === 1 ? "minute" : "minutes"}`;
}

export function getReservationTimingLabel(reservation, text, now = new Date()) {
  const minutes = getReservationMinutesFromNow(reservation, now);

  if (minutes === null) return "";
  if (reservation.isArrived) return text.arrivedStatus;
  if (minutes <= -10) return `${Math.abs(minutes)} min ${text.late}`;
  if (minutes <= 0) return text.now;

  return formatReservationLeadTime(minutes, text.dueIn === "след" ? "bg" : "en");
}

