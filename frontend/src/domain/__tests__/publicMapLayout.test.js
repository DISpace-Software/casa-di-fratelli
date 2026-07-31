import test from "node:test";
import assert from "node:assert/strict";
import { getPublicMapTablePoints } from "../reservations/publicMapLayout.js";

test("mobile indoor and covered terrace tables shift right without changing desktop coordinates", () => {
  assert.deepEqual(getPublicMapTablePoints({ id: "8", x: 16, y: 20 }, "indoor"), {
    desktop: { x: 16, y: 20 },
    tablet: { x: 16, y: 20 },
    mobile: { x: 23, y: 20 },
  });
  assert.deepEqual(getPublicMapTablePoints({ id: "42", x: 17, y: 22 }, "garden"), {
    desktop: { x: 17, y: 22 },
    tablet: { x: 17, y: 22 },
    mobile: { x: 24, y: 22 },
  });
});

test("mobile open terrace uses aligned rows while preserving production coordinates", () => {
  assert.deepEqual(getPublicMapTablePoints({ id: "63", x: 10.4, y: 21.1 }, "openTerrace"), {
    desktop: { x: 10.4, y: 21.1 },
    tablet: { x: 10.4, y: 21.1 },
    mobile: { x: 18.275, y: 47 },
  });
  assert.deepEqual(getPublicMapTablePoints({ id: "52", x: 90.5, y: 50.6 }, "openTerrace"), {
    desktop: { x: 90.5, y: 50.6 },
    tablet: { x: 90.5, y: 50.6 },
    mobile: { x: 94, y: 80 },
  });

  const upperRow = ["63", "62", "61", "60"].map((id) =>
    getPublicMapTablePoints({ id, x: 0, y: 0 }, "openTerrace").mobile.x
  );
  upperRow.slice(1).forEach((x, index) => {
    assert.ok(Math.abs(x - upperRow[index] - 12.15) < 0.001);
  });
});

test("tablet open terrace keeps at least a clear two-row gap", () => {
  const upper = getPublicMapTablePoints({ id: "46", x: 34, y: 40 }, "openTerrace");
  const lower = getPublicMapTablePoints({ id: "48", x: 34, y: 68 }, "openTerrace");

  assert.deepEqual(upper.tablet, { x: 34, y: 34 });
  assert.deepEqual(lower.tablet, { x: 34, y: 72 });
  assert.equal(lower.tablet.y - upper.tablet.y, 38);
});
