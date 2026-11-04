import test from "node:test";
import assert from "node:assert/strict";
import { restaurantAssetUrl } from "../adminMap/restaurantAssets.js";

test("shared admin resolves restaurant images without modifying stored values", () => {
  const item = { imageUrl: "/menu/dish.jpg" };
  assert.equal(restaurantAssetUrl(item.imageUrl, "https://casadifratelli.bg"), "https://casadifratelli.bg/menu/dish.jpg");
  assert.equal(restaurantAssetUrl("events/photo.jpg", "https://cofein.vercel.app/"), "https://cofein.vercel.app/events/photo.jpg");
  assert.equal(item.imageUrl, "/menu/dish.jpg");
});

test("uploaded previews and absolute media retain their source, Casa legacy relatives remain intact", () => {
  for (const source of ["data:image/jpeg;base64,AA==", "blob:https://admin.example.test/photo", "https://cdn.example.test/photo.jpg"]) {
    assert.equal(restaurantAssetUrl(source, "https://cofein.vercel.app"), source);
  }
  assert.equal(restaurantAssetUrl("/menu/dish.jpg"), "/menu/dish.jpg");
});

test("empty and unsupported image schemes do not become shared-host requests", () => {
  for (const source of [null, "", "javascript:alert(1)", "file:///private/image.jpg", "\\server\\image.jpg"]) {
    assert.equal(restaurantAssetUrl(source, "https://cofein.vercel.app"), "");
  }
  assert.equal(restaurantAssetUrl("/photo.jpg", "not a URL"), "");
});
