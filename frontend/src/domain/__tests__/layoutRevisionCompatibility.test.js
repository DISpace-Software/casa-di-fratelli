import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createLayoutSession } from "../adminMap/layoutSession.js";

async function fixture(t, mode = "current") {
  const backend = {
    mode, revision: "r1", tables: [{ id: "1", area: "indoor", x: 50, y: 50, seats: 4 }],
    plan: { schemaVersion: 1, zones: [{ id: "indoor", name: "Hall", isActive: true }], combinations: [], staffCombinationMode: "same-zone", publicMaxGuests: 8, publicMaxTables: 1 },
    calls: [], saveStatus: 0, readStatus: 0, readStatusAfterSave: 0, pauseSave: null,
  };
  const currentPlan = () => ({ ...backend.plan, revision: backend.revision, tables: backend.tables.map(table => ({ area: "indoor", x: 50, y: 50, ...table })) });
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    backend.calls.push({ path: request.url, method: request.method, revision: request.headers["if-match"], body });
    const send = (status, data) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(data)); };
    if (request.method === "PUT") {
      if (backend.pauseSave) await backend.pauseSave;
      if (backend.saveStatus === "disconnect") { request.socket.destroy(); return; }
      if (backend.saveStatus) return send(backend.saveStatus, { message: "Rejected" });
      const fullPlan = request.url === "/api/floor-plan";
      if (fullPlan && backend.mode === "legacy") return send(404, {});
      const draft = JSON.parse(body);
      const revision = fullPlan ? draft.revision : request.headers["if-match"]?.replaceAll('"', "");
      if (backend.mode === "current" && revision !== backend.revision) {
        return send(fullPlan || revision ? 409 : 428, { message: "Reload required" });
      }
      backend.tables = fullPlan ? draft.tables : draft;
      if (fullPlan) backend.plan = draft;
      backend.revision += "-saved";
      backend.readStatus = backend.readStatusAfterSave;
      return send(200, fullPlan ? currentPlan() : backend.tables);
    }
    if (backend.readStatus) return send(backend.readStatus, { message: "Unavailable" });
    if (request.url === "/api/floor-plan") {
      return backend.mode === "legacy" ? send(404, {}) : send(200, currentPlan());
    }
    return send(200, backend.tables);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const options = { request: fetch, baseUrl: `http://127.0.0.1:${server.address().port}`, normalize: value => value };
  return { backend, options };
}

test("published legacy API works before rollout, without revision headers", async t => {
  const { backend, options } = await fixture(t, "legacy");
  const editor = createLayoutSession();
  assert.equal(await editor.load(options), true);
  editor.edit(tables => tables.map(table => ({ ...table, seats: 6 })));
  assert.equal(await editor.save(options), true);
  const put = backend.calls.find(call => call.method === "PUT");
  assert.equal(put.path, "/api/table-layouts");
  assert.equal(put.revision, undefined);
  assert.equal(backend.tables[0].seats, 6);
  assert.equal(editor.getSnapshot().dirty, false);
});

test("two administrators: stale draft is retained, blocked, and never silently rebased", async t => {
  const { backend, options } = await fixture(t);
  const first = createLayoutSession(), second = createLayoutSession();
  await first.load(options);
  await second.load(options);
  first.edit([{ id: "1", seats: 6 }]);
  second.edit([{ id: "1", seats: 8 }]);
  await first.save(options);
  const beforeSave = backend.calls.length;
  await assert.rejects(second.save(options), error => error.status === 409);
  assert.deepEqual(backend.calls.slice(beforeSave).map(call => call.method), ["PUT"]);
  assert.equal(backend.calls.at(-1).revision, '"r1"');
  assert.equal(second.getSnapshot().tables[0].seats, 8);
  assert.equal(second.getSnapshot().requiresReload, true);
  assert.equal(await second.load(options), false);
  assert.equal(await second.save(options), false);
  assert.deepEqual(backend.calls.slice(beforeSave).map(call => call.method), ["PUT", "GET"]);
  assert.equal(second.getSnapshot().tables[0].seats, 8);
  assert.equal(second.getSnapshot().requiresReload, true);
  assert.equal(backend.tables[0].seats, 6);
  await second.load({ ...options, discard: true });
  assert.equal(second.getSnapshot().tables[0].seats, 6);
  assert.equal(second.getSnapshot().requiresReload, false);
});

test("rollout between load and save returns 428 and needs explicit reload", async t => {
  const { backend, options } = await fixture(t, "legacy");
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit([{ id: "1", seats: 6 }]);
  backend.mode = "current";
  await assert.rejects(editor.save(options), error => error.status === 428);
  assert.equal(editor.getSnapshot().tables[0].seats, 6);
  assert.equal(editor.getSnapshot().requiresReload, true);
  await editor.load({ ...options, discard: true });
  editor.edit([{ id: "1", seats: 6 }]);
  await editor.save(options);
  assert.equal(backend.calls.filter(call => call.method === "PUT").at(-1).revision, '"r1"');
});

test("background reload preserves unsaved edits and their original revision", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit([{ id: "1", seats: 6 }]);
  const count = backend.calls.length;
  backend.revision = "r2";
  backend.tables = [{ id: "1", seats: 10 }];
  assert.equal(await editor.load(options), false);
  assert.equal(backend.calls.length, count + 1);
  assert.equal(editor.getSnapshot().revision, "r1");
  assert.equal(editor.getSnapshot().tables[0].seats, 6);
  assert.equal(editor.getSnapshot().savedTables[0].seats, 10);
});

test("new API failures never downgrade to unversioned legacy reads", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  backend.readStatus = 500;
  await assert.rejects(editor.load(options), error => error.status === 500);
  assert.deepEqual(backend.calls.map(call => call.path), ["/api/floor-plan"]);
  assert.equal(editor.getSnapshot().loaded, false);
  assert.equal(await editor.save(options), false);
});

test("failed explicit reload retains the current draft and reload requirement", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit([{ id: "1", seats: 6 }]);
  backend.saveStatus = 409;
  await assert.rejects(editor.save(options));
  backend.readStatus = 500;
  await assert.rejects(editor.load({ ...options, discard: true }));
  assert.equal(editor.getSnapshot().tables[0].seats, 6);
  assert.equal(editor.getSnapshot().requiresReload, true);
  assert.equal(editor.getSnapshot().busy, false);
});

test("unknown save outcome blocks retry without losing the draft", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit([{ id: "1", seats: 6 }]);
  backend.saveStatus = "disconnect";
  await assert.rejects(editor.save(options));
  assert.equal(editor.getSnapshot().requiresReload, true);
  assert.equal(editor.getSnapshot().tables[0].seats, 6);
  const count = backend.calls.length;
  assert.equal(await editor.save(options), false);
  assert.equal(backend.calls.length, count);
});

test("duplicate save and editing during a pending save are blocked", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit([{ id: "1", seats: 6 }]);
  let release;
  backend.pauseSave = new Promise(resolve => { release = resolve; });
  const saving = editor.save(options);
  assert.equal(await editor.save(options), false);
  editor.edit([{ id: "1", seats: 8 }]);
  assert.equal(editor.updatePlan(plan => ({ ...plan, zones: [] })), false);
  assert.equal(await editor.load({ ...options, discard: true }), false);
  release();
  await saving;
  assert.equal(backend.calls.filter(call => call.method === "PUT").length, 1);
  assert.equal(backend.tables[0].seats, 6);
});

test("validation rejection can be corrected with the same original revision", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit([{ id: "1", seats: 0 }]);
  backend.saveStatus = 400;
  await assert.rejects(editor.save(options), error => error.status === 400);
  assert.equal(editor.getSnapshot().requiresReload, false);
  editor.edit([{ id: "1", seats: 6 }]);
  backend.saveStatus = 0;
  await editor.save(options);
  assert.equal(backend.tables[0].seats, 6);
});

test("non-Casa admin never falls back to a legacy map on 404", async t => {
  const { backend, options } = await fixture(t, "legacy");
  const editor = createLayoutSession();
  await assert.rejects(editor.load({ ...options, allowLegacy: false }), error => error.status === 404);
  assert.deepEqual(backend.calls.map(call => call.path), ["/api/floor-plan"]);
  assert.equal(editor.getSnapshot().loaded, false);
});

test("saved map metadata refreshes independently without rebasing an editor draft", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.edit(tables => tables.map(table => ({ ...table, seats: 6 })));
  const original = editor.getSnapshot().plan;
  backend.revision = "r2";
  backend.tables = [{ id: "1", seats: 8 }];
  await editor.load(options);
  assert.equal(editor.getSnapshot().plan, original);
  assert.equal(editor.getSnapshot().plan.revision, "r1");
  assert.equal(editor.getSnapshot().savedPlan.revision, "r2");
  assert.equal(editor.getSnapshot().savedTables[0].seats, 8);
  assert.equal(editor.getSnapshot().tables[0].seats, 6);
  await assert.rejects(editor.save(options), error => error.status === 409);
});

test("unchanged background map retains stable geometry data", async t => {
  const { options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  const original = editor.getSnapshot();
  await editor.load(options);
  assert.equal(editor.getSnapshot().savedPlan, original.savedPlan);
  assert.equal(editor.getSnapshot().savedTables, original.savedTables);
});

test("new hall and tables save atomically with policy and additive metadata", async t => {
  const { backend, options } = await fixture(t);
  backend.plan.layout = { version: 2, views: [{ id: "whole", custom: { texture: "wood" } }] };
  backend.tables[0].appearance = { rotation: 45 };
  backend.plan.landmarks = [{ id: "entry", area: "indoor", kind: "entrance", x: 10, y: 95 }];
  backend.plan.zones[0].names = { bg: "Зала", en: "Hall", ru: "Зал" };
  const editor = createLayoutSession();
  const normalizedOptions = { ...options, normalize: ({ id, area, x, y, seats }) => ({ id, area, x, y, seats }) };
  await editor.load(normalizedOptions);
  const original = editor.getSnapshot();
  assert.equal(editor.updatePlan(plan => ({
    ...plan,
    zones: [...plan.zones, { id: "roof", name: "Покривна тераса", isActive: true, presentation: "plain", names: { bg: "Покривна тераса" } }],
    tables: [...plan.tables, { id: "R01", area: "roof", x: 30, y: 30, seats: 6, isActive: true }],
  })), true);
  editor.edit(tables => tables.map(table => ({ id: table.id, seats: table.id === "R01" ? 8 : 6 })));
  const draft = editor.getSnapshot();
  assert.equal(draft.plan.tables, draft.tables);
  assert.equal(draft.savedPlan, original.savedPlan);
  assert.equal(draft.savedTables, original.savedTables);
  assert.equal(original.plan.zones.length, 1);
  assert.equal(original.tables[0].seats, 4);
  assert.equal(await editor.save(normalizedOptions), true);
  const puts = backend.calls.filter(call => call.method === "PUT");
  assert.equal(puts.length, 1);
  assert.equal(puts[0].path, "/api/floor-plan");
  const sent = JSON.parse(puts[0].body);
  assert.equal(sent.revision, "r1");
  assert.equal(sent.zones.at(-1).id, "roof");
  assert.equal(sent.tables.at(-1).area, "roof");
  assert.equal(sent.tables.at(-1).seats, 8);
  assert.equal(sent.staffCombinationMode, "same-zone");
  assert.equal(sent.publicMaxGuests, 8);
  assert.equal(sent.publicMaxTables, 1);
  assert.deepEqual(sent.combinations, []);
  assert.deepEqual(sent.layout, original.plan.layout);
  assert.deepEqual(sent.landmarks, original.plan.landmarks);
  assert.deepEqual(sent.zones[0].names, original.plan.zones[0].names);
  assert.deepEqual(sent.tables[0].appearance, { rotation: 45 });
  const saved = editor.getSnapshot();
  assert.equal(saved.plan, saved.savedPlan);
  assert.equal(saved.plan.tables, saved.tables);
  assert.equal(saved.tables, saved.savedTables);
  assert.equal(saved.revision, "r1-saved");
  assert.equal(saved.dirty, false);
});

test("whole-plan draft stays isolated from operational refreshes and cannot change its revision", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  const original = editor.getSnapshot().savedPlan;
  editor.updatePlan(plan => {
    plan.zones[0].name = "Local hall name";
    plan.revision = "forged-new-revision";
    return plan;
  });
  assert.equal(original.zones[0].name, "Hall");
  const draft = editor.getSnapshot().plan;
  backend.plan.zones[0].name = "Other administrator";
  backend.plan.staffCombinationMode = "configured";
  backend.revision = "r2";
  assert.equal(await editor.load(options), false);
  assert.equal(editor.getSnapshot().plan, draft);
  assert.equal(draft.zones[0].name, "Local hall name");
  assert.equal(draft.staffCombinationMode, "same-zone");
  assert.equal(draft.revision, "r1");
  assert.equal(editor.getSnapshot().savedPlan.zones[0].name, "Other administrator");
  assert.equal(editor.getSnapshot().savedPlan.staffCombinationMode, "configured");
  const count = backend.calls.length;
  await assert.rejects(editor.save(options), error => error.status === 409);
  assert.deepEqual(backend.calls.slice(count).map(call => [call.method, call.path]), [["PUT", "/api/floor-plan"]]);
  assert.equal(editor.getSnapshot().plan, draft);
  assert.equal(await editor.save(options), false);
  await editor.load({ ...options, discard: true });
  assert.equal(editor.getSnapshot().plan.zones[0].name, "Other administrator");
  assert.equal(editor.getSnapshot().dirty, false);
});

test("hall validation rejection retains the whole draft for correction", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.updatePlan(plan => ({ ...plan, zones: plan.zones.map(zone => ({ ...zone, name: "" })) }));
  backend.saveStatus = 400;
  await assert.rejects(editor.save(options), error => error.status === 400 && error.acknowledged === false);
  assert.equal(editor.getSnapshot().plan.zones[0].name, "");
  assert.equal(editor.getSnapshot().savedPlan.zones[0].name, "Hall");
  assert.equal(editor.getSnapshot().requiresReload, false);
  editor.updatePlan(plan => ({ ...plan, zones: plan.zones.map(zone => ({ ...zone, name: "New hall name" })) }));
  backend.saveStatus = 0;
  await editor.save(options);
  assert.equal(backend.plan.zones[0].name, "New hall name");
  assert.deepEqual(backend.calls.filter(call => call.method === "PUT").map(call => JSON.parse(call.body).revision), ["r1", "r1"]);
});

test("acknowledged full save with a failed refresh blocks duplicate writes until explicit reload", async t => {
  const { backend, options } = await fixture(t);
  const editor = createLayoutSession();
  await editor.load(options);
  editor.updatePlan(plan => ({ ...plan, zones: [...plan.zones, { id: "new", name: "New hall", isActive: true }] }));
  const draft = editor.getSnapshot().plan;
  backend.readStatusAfterSave = 503;
  await assert.rejects(editor.save(options), error => error.status === 503 && error.acknowledged === true);
  assert.equal(editor.getSnapshot().plan, draft);
  assert.equal(editor.getSnapshot().requiresReload, true);
  assert.equal(editor.getSnapshot().dirty, true);
  assert.equal(backend.plan.zones.length, 2);
  const count = backend.calls.length;
  assert.equal(await editor.save(options), false);
  assert.equal(backend.calls.length, count);
  backend.readStatus = 0;
  assert.equal(await editor.load(options), false);
  assert.equal(editor.getSnapshot().requiresReload, true);
  assert.equal(editor.getSnapshot().revision, "r1");
  await editor.load({ ...options, discard: true });
  assert.equal(editor.getSnapshot().requiresReload, false);
  assert.equal(editor.getSnapshot().revision, "r1-saved");
  assert.equal(backend.calls.filter(call => call.method === "PUT").length, 1);
});

test("legacy sessions do not invent hall editing or discard policies after a known full API disappears", async t => {
  const { backend, options } = await fixture(t, "legacy");
  const editor = createLayoutSession();
  await editor.load(options);
  const original = editor.getSnapshot();
  assert.equal(editor.updatePlan({ zones: [{ id: "new", name: "New hall", isActive: true }] }), false);
  assert.equal(editor.getSnapshot(), original);
  backend.mode = "current";
  await editor.load(options);
  backend.mode = "legacy";
  const count = backend.calls.length;
  await assert.rejects(editor.load(options), error => error.status === 404);
  assert.deepEqual(backend.calls.slice(count).map(call => call.path), ["/api/floor-plan"]);
  assert.equal(editor.getSnapshot().plan.staffCombinationMode, "same-zone");
});
