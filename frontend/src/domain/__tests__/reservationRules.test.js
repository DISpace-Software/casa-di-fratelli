import test from "node:test";
import assert from "node:assert/strict";

import {
  defaultGardenTables,
  defaultIndoorTables,
  defaultOpenTerraceTables,
  adminReservationTimes,
  reservationTimes,
  isRetiredTableId,
} from "../reservations/tableConfig.js";
import {
  canUseAdminTableSelection,
  getEligibleIndoorGroups,
  getEligibleOpenTerraceGroups,
  getTablesCapacity,
  isLogicalTerraceSelection,
} from "../reservations/tableRules.js";
import {
  getAvailableReservationTimesForDate,
  getBookableReservationDates,
  getTodayInputValue,
  isPastTimeForDate,
  isWithinReservationBuffer,
  timeToMinutes,
} from "../reservations/dateTimeRules.js";
import {
  getUnavailableSelectedTableIds,
  getUnavailableTableIdsForSlot,
} from "../reservations/availability.js";

const byId = (tables, id) => tables.find((table) => table.id === id);

test("reservation times use 15 minute slots with separate public and admin cutoffs", () => {
  assert.equal(reservationTimes.length, 45);
  assert.equal(reservationTimes[0], "10:00");
  assert.equal(reservationTimes.at(-1), "21:00");
  assert.equal(adminReservationTimes.length, 53);
  assert.equal(adminReservationTimes[0], "10:00");
  assert.equal(adminReservationTimes.at(-1), "23:00");
});

test("time helpers keep the 3 hour reservation buffer exclusive", () => {
  assert.equal(timeToMinutes("19:30"), 1170);
  assert.equal(isWithinReservationBuffer("19:00", "19:59"), true);
  assert.equal(isWithinReservationBuffer("19:00", "21:59"), true);
  assert.equal(isWithinReservationBuffer("19:00", "22:00"), false);
  assert.equal(isWithinReservationBuffer("23:30", "00:00"), true);
  assert.equal(isWithinReservationBuffer("10:00 - 22:00", "19:00"), true);
  assert.equal(isWithinReservationBuffer("bad", "bad"), true);
  assert.equal(isWithinReservationBuffer("bad", "19:00"), false);
});

test("date helpers identify past date-times and hide old slots for today", () => {
  const now = new Date("2026-05-14T15:30:00");

  assert.equal(getTodayInputValue(now), "2026-05-14");
  assert.equal(isPastTimeForDate("2026-05-13", "22:00", now), true);
  assert.equal(isPastTimeForDate("2026-05-14", "15:00", now), true);
  assert.equal(isPastTimeForDate("2026-05-14", "16:00", now), false);
  assert.equal(isPastTimeForDate("2026-05-15", "10:00", now), false);
  assert.deepEqual(
    getAvailableReservationTimesForDate(["14:00", "15:00", "16:00"], "2026-05-14", now),
    ["16:00"]
  );
  assert.deepEqual(
    getAvailableReservationTimesForDate(["14:00", "15:00"], "2026-05-15", now),
    ["14:00", "15:00"]
  );
});

test("today availability keeps only remaining working-hour slots", () => {
  const now = new Date("2026-05-14T20:30:00");

  assert.deepEqual(
    getAvailableReservationTimesForDate(reservationTimes, "2026-05-14", now),
    ["20:45", "21:00"]
  );
  assert.deepEqual(
    getAvailableReservationTimesForDate(reservationTimes, "2026-05-15", now),
    reservationTimes
  );
});

test("bookable date list hides past and closure dates", () => {
  assert.deepEqual(
    getBookableReservationDates({
      today: "2026-07-31",
      maxDate: "2026-08-05",
      closure: {
        enabled: true,
        startDate: "2026-07-20",
        endDate: "2026-08-02",
        reopenDate: "2026-08-03",
      },
    }),
    ["2026-08-03", "2026-08-04", "2026-08-05"]
  );

  assert.deepEqual(
    getBookableReservationDates({
      today: "2026-07-31",
      maxDate: "2026-08-02",
      includeToday: false,
    }),
    ["2026-08-01", "2026-08-02"]
  );
});

test("capacity calculation and group eligibility support large indoor parties", () => {
  assert.equal(getTablesCapacity(defaultIndoorTables, ["20", "21", "22", "23"]), 16);
  assert.deepEqual(getEligibleIndoorGroups(16, defaultIndoorTables), [["20", "21", "22", "23"]]);
  assert.deepEqual(getEligibleIndoorGroups(13, defaultIndoorTables), [["20", "21", "22", "23"]]);
});

test("open terrace allows only groups with enough seats", () => {
  assert.deepEqual(getEligibleOpenTerraceGroups(8, defaultOpenTerraceTables), [["46", "47"]]);
  assert.deepEqual(getEligibleOpenTerraceGroups(3, defaultOpenTerraceTables), [["46", "47"], ["48", "49"]]);
  assert.deepEqual(getEligibleOpenTerraceGroups(2, defaultOpenTerraceTables), [["46", "47"], ["48", "49"]]);
});

test("garden table combinations must be logical and continuous", () => {
  assert.equal(
    isLogicalTerraceSelection([byId(defaultGardenTables, "42"), byId(defaultGardenTables, "43")], byId(defaultGardenTables, "44")),
    true
  );
  assert.equal(
    isLogicalTerraceSelection([byId(defaultGardenTables, "42"), byId(defaultGardenTables, "44")], byId(defaultGardenTables, "45")),
    false
  );
});

test("retired tables never appear in the default layout", () => {
  assert.equal(defaultGardenTables.some((table) => isRetiredTableId(table.id)), false);
  assert.equal(isRetiredTableId("30a"), true);
  assert.equal(isRetiredTableId("34A"), true);
  assert.equal(isRetiredTableId("45A"), true);
});

test("admin table selection accepts only configured combinations per area", () => {
  assert.equal(canUseAdminTableSelection("indoor", ["20", "21", "22", "23"]), true);
  assert.equal(canUseAdminTableSelection("indoor", ["20", "24"]), false);
  assert.equal(canUseAdminTableSelection("indoor", ["5", "6"], { requiredSeats: 13, allowPartial: false }), false);
  assert.equal(canUseAdminTableSelection("indoor", ["20"], { requiredSeats: 16, allowPartial: true }), true);
  assert.equal(canUseAdminTableSelection("indoor", ["20", "21", "22"], { requiredSeats: 16, allowPartial: false }), false);
  assert.equal(canUseAdminTableSelection("indoor", ["20", "21", "22", "23"], { requiredSeats: 16, allowPartial: false }), true);
  assert.equal(canUseAdminTableSelection("garden", ["42", "43", "44"]), true);
  assert.equal(canUseAdminTableSelection("garden", ["34", "38"]), false);
  assert.equal(canUseAdminTableSelection("openTerrace", ["46", "47"]), true);
  assert.equal(canUseAdminTableSelection("openTerrace", ["46", "49"]), false);
});

test("availability excludes only confirmed reservations within the 3 hour buffer", () => {
  const reservations = [
    { id: 1, status: "Approved", reservedDate: "2026-05-14", reservedTime: "19:00", tableIds: ["20", "21"] },
    { id: 2, status: "AwaitingEmailConfirmation", reservedDate: "2026-05-14", reservedTime: "19:00", tableIds: ["22"] },
    { id: 3, status: "Cancelled", reservedDate: "2026-05-14", reservedTime: "19:30", tableIds: ["23"] },
    { id: 4, status: "Approved", reservedDate: "2026-05-15", reservedTime: "19:00", tableIds: ["24"] },
    { id: 5, status: "Approved", reservedDate: "2026-05-14", reservedTime: "22:29", tableIds: ["25"] },
    { id: 6, status: "Approved", reservedDate: "2026-05-14", reservedTime: "22:30", tableIds: ["26"] },
    { id: 7, status: "Released", reservedDate: "2026-05-14", reservedTime: "20:00", tableIds: ["27"] },
    { id: 8, status: "Approved", reservedDate: "2026-05-14", reservedTime: "20:00" },
    { id: 9, status: "Approved", reservedDate: "2026-05-14", reservedTime: "20:00", tableIds: [] },
  ];

  const unavailable = getUnavailableTableIdsForSlot(reservations, "2026-05-14", "19:30");

  assert.deepEqual([...unavailable].sort(), ["20", "21", "25"]);
  assert.deepEqual(getUnavailableSelectedTableIds(["20", "20", "22", "25"], unavailable), ["20", "25"]);
  assert.equal(getUnavailableTableIdsForSlot(reservations, "2026-05-14", "19:30", 1).has("20"), false);
  assert.equal(getUnavailableTableIdsForSlot(reservations, "", "19:30").size, 0);
  assert.equal(getUnavailableTableIdsForSlot(reservations, "2026-05-14", "").size, 0);
});
