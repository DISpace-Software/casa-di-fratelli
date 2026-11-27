// These are display rules, not booking authority. The server owns allocation and expiry.
export function isValidOfferDuration(value) {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= 3 && minutes <= 10;
}

export function remainingOfferSeconds(expiresAtUtc, clientNow, serverClockOffset) {
  return Math.max(0, Math.floor((Date.parse(expiresAtUtc) - (clientNow + serverClockOffset)) / 1000));
}

export function canCloseWaitlistEntry(status) {
  return ['waiting', 'offered', 'paused'].includes(status);
}
