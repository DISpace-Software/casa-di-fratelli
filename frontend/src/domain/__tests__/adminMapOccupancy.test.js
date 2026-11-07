import test from "node:test";
import assert from "node:assert/strict";
import { getRestaurantOccupancy } from "../adminMap/occupancy.js";

test("restaurant occupancy counts arrived guests and active table capacity", () => {
  const now = new Date(2026, 7, 3, 19, 0, 0);
  const result = getRestaurantOccupancy(
    [
      { id: "1", seats: 4, isActive: true },
      { id: "2", seats: 6, isActive: true },
      { id: "3", seats: 8, isActive: false },
    ],
    [
      { id: 1, guestCount: 3, reservedDate: "2026-08-03", reservedTime: "18:30", isArrived: true, status: "Approved" },
      { id: 2, guestCount: 2, reservedDate: "2026-08-03", reservedTime: "19:30", isArrived: false, status: "Approved" },
      { id: 3, guestCount: 4, reservedDate: "2026-08-03", reservedTime: "18:00", isArrived: true, status: "Released" },
      { id: 4, guestCount: 2, reservedDate: "2026-08-02", reservedTime: "18:00", isArrived: true, status: "Approved" },
    ],
    now
  );

  assert.deepEqual(result, { currentVisitors: 3, delayedVisitors: 0, freeSeats: 7, totalSeats: 10 });
});

test("free seats never become negative", () => {
  const now = new Date(2026, 7, 3, 19, 0, 0);
  assert.deepEqual(
    getRestaurantOccupancy(
      [{ id: "1", seats: 4, isActive: true }],
      [{ id: 1, guestCount: 6, reservedDate: "2026-08-03", reservedTime: "18:00", isArrived: true, status: "Approved" }],
      now
    ),
    { currentVisitors: 6, delayedVisitors: 0, freeSeats: 0, totalSeats: 4 }
  );
});

test("guests delayed by more than 15 minutes reduce free seats", () => {
  const now = new Date(2026, 7, 3, 19, 0, 0);
  const result = getRestaurantOccupancy(
    [{ id: "1", seats: 20, isActive: true }],
    [
      { id: 1, guestCount: 4, reservedDate: "2026-08-03", reservedTime: "18:44", isArrived: false, status: "Approved" },
      { id: 2, guestCount: 3, reservedDate: "2026-08-03", reservedTime: "18:45", isArrived: false, status: "Pending" },
      { id: 3, guestCount: 2, reservedDate: "2026-08-03", reservedTime: "18:30", isArrived: true, status: "Approved" },
    ],
    now
  );

  assert.deepEqual(result, { currentVisitors: 2, delayedVisitors: 4, freeSeats: 14, totalSeats: 20 });
});


test("seasonal closure removes only closed capacity and reopening restores it", () => {
  const now = new Date(2026, 10, 7, 19);
  const tables = [
    { id: "1", area: "indoor", seats: 108 },
    { id: "2", area: "garden", seats: 84 },
    { id: "3", area: "openTerrace", seats: 40 },
  ];
  const bookings = [{ guestCount: 92, reservedDate: "2026-11-07", isArrived: true, status: "Approved" }];
  const closed = getRestaurantOccupancy(tables, bookings, now, { closedAreas: ["openTerrace"] });
  assert.deepEqual(closed, { currentVisitors: 92, delayedVisitors: 0, freeSeats: 100, totalSeats: 192 });
  const reopened = getRestaurantOccupancy(tables, bookings, now, { closedAreas: [] });
  assert.equal(reopened.totalSeats, 232);
  assert.equal(reopened.freeSeats, 140);
  assert.equal(getRestaurantOccupancy(tables, bookings, now, { closedAreas: ["indoor", "garden", "openTerrace"] }).freeSeats, 0);
});

test("inactive zones and orphan tables never add restaurant capacity", () => {
  const tables = [{ area: "hall", seats: 10 }, { area: "retired", seats: 20 }, { area: "hall", seats: 30, isActive: false }];
  assert.equal(getRestaurantOccupancy(tables, [], new Date(), { activeZoneIds: ["hall"] }).totalSeats, 10);
  assert.equal(getRestaurantOccupancy(tables, [], new Date(), { activeZoneIds: [] }).totalSeats, 0);
});
