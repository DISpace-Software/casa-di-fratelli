import test from "node:test";
import assert from "node:assert/strict";
import { getPublicMapTablePoints } from "../reservations/publicMapLayout.js";

test("mobile indoor and covered terrace tables shift right without changing desktop coordinates", () => {
  assert.deepEqual(getPublicMapTablePoints({ id: "8", x: 16, y: 20 }, "indoor"), {
    desktop: { x: 16, y: 20 },
    mobile: { x: 23, y: 20 },
  });
  assert.deepEqual(getPublicMapTablePoints({ id: "42", x: 17, y: 22 }, "garden"), {
    desktop: { x: 17, y: 22 },
    mobile: { x: 24, y: 22 },
  });
});

test("mobile open terrace uses aligned rows while preserving production coordinates", () => {
  assert.deepEqual(getPublicMapTablePoints({ id: "63", x: 10.4, y: 21.1 }, "openTerrace"), {
    desktop: { x: 10.4, y: 21.1 },
    mobile: { x: 17, y: 20 },
  });
  assert.deepEqual(getPublicMapTablePoints({ id: "52", x: 90.5, y: 50.6 }, "openTerrace"), {
    desktop: { x: 90.5, y: 50.6 },
    mobile: { x: 85, y: 54 },
  });
});
