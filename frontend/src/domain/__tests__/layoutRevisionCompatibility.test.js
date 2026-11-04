import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createLayoutSession } from "../adminMap/layoutSession.js";

async function fixture(t, mode = "current") {
  const backend = { mode, revision: "r1", tables: [{ id: "1", area: "indoor", x: 50, y: 50, seats: 4 }], calls: [], saveStatus: 0, readStatus: 0, pauseSave: null };
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    backend.calls.push({ path: request.url, method: request.method, revision: request.headers["if-match"], body });
    const send = (status, data) => { response.writeHead(status, { "Content-Type": "application/json" }); response.end(JSON.stringify(data)); };
    if (request.method === "PUT") {
      if (backend.pauseSave) await backend.pauseSave;
      if (backend.saveStatus === "disconnect") { request.socket.destroy(); return; }
      if (backend.saveStatus) return send(backend.saveStatus, { message: "Rejected" });
      if (backend.mode === "current" && request.headers["if-match"] !== `"${backend.revision}"`) {
        return send(request.headers["if-match"] ? 409 : 428, { message: "Reload required" });
      }
      backend.tables = JSON.parse(body);
      backend.revision += "-saved";
      return send(200, backend.tables);
    }
    if (backend.readStatus) return send(backend.readStatus, { message: "Unavailable" });
    if (request.url === "/api/floor-plan") {
      return backend.mode === "legacy" ? send(404, {}) : send(200, { schemaVersion: 1, revision: backend.revision, zones: [{ id: "indoor", name: "Hall", isActive: true }], combinations: [], tables: backend.tables.map(table => ({ area: "indoor", x: 50, y: 50, ...table })) });
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
  const original = editor.getSnapshot().plan;
  editor.edit(tables => tables.map(table => ({ ...table, seats: 6 })));
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
