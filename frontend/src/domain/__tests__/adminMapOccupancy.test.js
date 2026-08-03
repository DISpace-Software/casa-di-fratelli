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
