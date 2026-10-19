export function buildTimeRange(startTime, endTime) {
  const toMinutes = (value) => {
    const [hours, minutes] = String(value || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    return hours * 60 + minutes;
  };

  const fromMinutes = (value) => {
    const hours = Math.floor(value / 60);
    const minutes = value % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start === null || end === null) return [];

  const normalizedEnd = end < start ? end + 24 * 60 : end;

  const times = [];

  for (let value = start; value <= normalizedEnd; value += 60) {
    times.push(fromMinutes(value % (24 * 60)));
  }
  const lastTime = fromMinutes(normalizedEnd % (24 * 60));
  if (times.at(-1) !== lastTime) times.push(lastTime);

  return times;
}


export function isHallBlock(reservation) {
  return reservation?.isHallBlock ?? reservation?.IsHallBlock ?? Boolean(
    (reservation?.createdByAdmin ?? reservation?.CreatedByAdmin) &&
    (reservation?.phone ?? reservation?.Phone) === "admin" &&
    (reservation?.guestName ?? reservation?.GuestName) === "Admin block"
  );
}
