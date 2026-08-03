import test from "node:test";
import assert from "node:assert/strict";
import { getRestaurantOccupancy } from "../adminMap/occupancy.js";

test("restaurant occupancy counts arrived guests and active table capacity", () => {
  const result = getRestaurantOccupancy(
    [
      { id: "1", seats: 4, isActive: true },
      { id: "2", seats: 6, isActive: true },
      { id: "3", seats: 8, isActive: false },
    ],
    [
      { id: 1, guestCount: 3, isArrived: true, status: "Approved" },
      { id: 2, guestCount: 2, isArrived: false, status: "Approved" },
      { id: 3, guestCount: 4, isArrived: true, status: "Released" },
      { id: 4, guestCount: 2, isArrived: true, status: "Cancelled" },
    ]
  );

  assert.deepEqual(result, { currentVisitors: 3, freeSeats: 7, totalSeats: 10 });
});

test("free seats never become negative", () => {
  assert.deepEqual(
    getRestaurantOccupancy(
      [{ id: "1", seats: 4, isActive: true }],
      [{ id: 1, guestCount: 6, isArrived: true, status: "Approved" }]
    ),
    { currentVisitors: 6, freeSeats: 0, totalSeats: 4 }
  );
});
