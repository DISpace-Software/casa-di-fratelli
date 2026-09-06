import test from "node:test";
import assert from "node:assert/strict";
import { daysUntilBirthday, getCustomerBirthDate, searchCustomers, sortCustomers } from "../customers/customerDirectory.js";

test("birthday directory accepts either API casing and excludes empty birthdays", () => {
  const customers = [{ BirthDate: "2000-09-06" }, { birthDate: null }, { birthDate: "" }, { birthDate: "2000-12-31" }];
  assert.equal(customers.filter((customer) => getCustomerBirthDate(customer)).length, 2);
});

test("next birthdays cross year boundaries and retain leap-day birthdays", () => {
  assert.equal(daysUntilBirthday("2000-01-01", "2026-12-31"), 1);
  assert.equal(daysUntilBirthday("2000-12-31", "2026-12-31"), 0);
  assert.equal(daysUntilBirthday("2000-02-29", "2028-02-28"), 1);
  assert.equal(daysUntilBirthday("2000-02-29", "2027-02-28"), 366);
  assert.equal(daysUntilBirthday("2000-02-30", "2026-01-01"), Infinity);
  assert.equal(daysUntilBirthday(null, "2026-01-01"), Infinity);
});

test("customer search handles Cyrillic, email case and formatted phone numbers", () => {
  const customers = [{ guestName: "Мария", email: "Guest@Example.com", phone: "+359 (888) 123-456" }];
  for (const query of ["мар", "guest@", "888123456", " +359 888 "]) {
    assert.equal(searchCustomers(customers, query).length, 1);
  }
  assert.equal(searchCustomers(customers, "no-match").length, 0);
  assert.equal(searchCustomers([{ GuestName: "Иван" }], "иван").length, 1);
});

test("birthday sorting is upcoming-first, missing last, without mutating customers", () => {
  const customers = [{ guestName: "A", birthDate: "2000-01-02" }, { guestName: "B", birthDate: "2000-12-31" }, { guestName: "C" }];
  const original = structuredClone(customers);
  assert.deepEqual(sortCustomers(customers, "birthday", "en", "2026-12-30").map((customer) => customer.guestName), ["B", "A", "C"]);
  assert.deepEqual(customers, original);
});

test("birthday email timestamps use restaurant time and accept .NET UTC without suffix", async () => {
  const { formatBirthdayEmailSentAt } = await import("../customers/customerDirectory.js");
  assert.equal(formatBirthdayEmailSentAt("2026-09-05T12:30:00", "en-GB"), "05/09/2026, 15:30");
  assert.equal(formatBirthdayEmailSentAt("2026-09-05T12:30:00Z", "en-GB"), "05/09/2026, 15:30");
  assert.equal(formatBirthdayEmailSentAt("2026-01-05T12:30:00Z", "en-GB"), "05/01/2026, 14:30");
  assert.equal(formatBirthdayEmailSentAt(null), "");
  assert.equal(formatBirthdayEmailSentAt("invalid"), "");
});
