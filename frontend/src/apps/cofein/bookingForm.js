// Reservation storage limits, plus the existing admin note limit. These checks
// help the guest correct input before sending; the API remains authoritative.
export const CONTACT_LIMITS = Object.freeze({ guestName: 120, phone: 50, email: 120, notes: 2000 });

const textValue = value => typeof value === 'string' ? value.trim() : '';

export function validateBookingContact(contact = {}) {
  const errors = {};
  const name = textValue(contact?.guestName);
  const phone = textValue(contact?.phone);
  const email = textValue(contact?.email);
  const notes = textValue(contact?.notes);

  if (name.length < 2) errors.guestName = 'Въведете име с поне 2 символа.';
  else if (name.length > CONTACT_LIMITS.guestName) errors.guestName = 'Името може да съдържа до 120 символа.';

  if (!phone) errors.phone = 'Въведете телефон за връзка с Вас.';
  else if (phone.length > CONTACT_LIMITS.phone) errors.phone = 'Телефонът може да съдържа до 50 символа.';
  else if (!/^\+?[\d\s()./-]+$/.test(phone) || phone.replace(/\D/g, '').length < 6) {
    errors.phone = 'Въведете валиден телефон, например 089 330 0305 или +359 893 300 305.';
  }

  if (!email) errors.email = 'Въведете имейл за резервацията.';
  else if (email.length > CONTACT_LIMITS.email) errors.email = 'Имейлът може да съдържа до 120 символа.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Въведете валиден имейл, например name@example.com.';

  if (notes.length > CONTACT_LIMITS.notes) errors.notes = 'Бележката може да съдържа до 2000 символа.';
  if (contact?.privacyConsent !== true) errors.privacyConsent = 'Потвърдете съгласието си, за да изпратим резервацията.';
  return errors;
}
