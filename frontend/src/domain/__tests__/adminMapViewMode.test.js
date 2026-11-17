import test from "node:test";
import assert from "node:assert/strict";
import { resolveAdminMapViewMode, sectionForAdminSelection } from "../adminMap/mapViewMode.js";

test("Cofein keeps sections as its default while Casa keeps its existing whole-map default", () => {
  for (const value of [null, undefined, "", "invalid"]) {
    assert.equal(resolveAdminMapViewMode(value, "cofein"), "section");
    assert.equal(resolveAdminMapViewMode(value, "casa-di-fratelli"), "scroll");
  }
  for (const tenant of ["cofein", "casa-di-fratelli", "another-restaurant"]) {
    assert.equal(resolveAdminMapViewMode("section", tenant), "section");
    assert.equal(resolveAdminMapViewMode("scroll", tenant), "scroll");
  }
});

const views = [
  { id: "interior-main", tableIds: ["T19", "T20"] },
  { id: "interior-angled", tableIds: ["T23", "F01"] },
];

test("returning from the whole map keeps the selected table in view", () => {
  assert.equal(sectionForAdminSelection(views, "interior-main", ["T23"]).id, "interior-angled");
});

test("moves across sections preserve a currently visible target and do not change the draft", () => {
  const selected = Object.freeze(["T19", "F01"]);
  assert.equal(sectionForAdminSelection(views, "interior-angled", selected).id, "interior-angled");
  assert.deepEqual(selected, ["T19", "F01"]);
});

test("a selected reservation finds its section even when the old camera belongs to another hall", () => {
  assert.equal(sectionForAdminSelection(views, "exterior-lower", ["F01"]).id, "interior-angled");
});

test("missing or removed selections retain a valid section and empty halls fail safely", () => {
  assert.equal(sectionForAdminSelection(views, "interior-angled", []).id, "interior-angled");
  assert.equal(sectionForAdminSelection(views, "interior-angled", ["removed"]).id, "interior-angled");
  assert.equal(sectionForAdminSelection(views, "removed", []).id, "interior-main");
  assert.equal(sectionForAdminSelection([], "removed", ["removed"]), null);
});
