import test from "node:test";
import assert from "node:assert/strict";
import { findPublicTableHold } from "../reservations/publicTableHolds.js";

test("a free table finds its selected-day hold, including a group hold", () => {
  const hold = { id: "hold-1", reservedDate: "2026-09-06", tableIds: ["50", "51"] };
  assert.equal(findPublicTableHold([hold], "2026-09-06", ["50"]), hold);
  assert.equal(findPublicTableHold([hold], "2026-09-06", ["50", "51"]), hold);
  assert.equal(findPublicTableHold([hold], "2026-09-07", ["50"]), null);
  assert.equal(findPublicTableHold([hold], "2026-09-06", ["60"]), null);
  assert.equal(findPublicTableHold([hold], "2026-09-06", []), null);
});

test("table hold lookup supports PascalCase API responses", () => {
  const hold = { Id: "hold-1", ReservedDate: "2026-09-06", TableIds: ["60"] };
  assert.equal(findPublicTableHold([hold], "2026-09-06", ["60"]), hold);
});
