import { validAdminPlan } from "./adminSessionPlan.js";

function requestError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readSnapshot(request, baseUrl, allowLegacy) {
  const response = await request(`${baseUrl}/api/floor-plan`, { cache: "no-store" });
  if (response.status === 404 && allowLegacy) {
    // Only the old API's missing endpoint permits the pre-rollout contract.
    const legacy = await request(`${baseUrl}/api/table-layouts`, { cache: "no-store" });
    if (!legacy.ok) throw requestError(legacy.status, "Failed to load table layout.");
    const tables = await legacy.json();
    if (!Array.isArray(tables)) throw requestError(0, "Invalid table layout response.");
    return { tables, revision: null, plan: null };
  }
  if (!response.ok) throw requestError(response.status, "Failed to load table layout.");
  const plan = await response.json();
  if (!validAdminPlan(plan)) {
    throw requestError(0, "Invalid floor plan response.");
  }
  return { tables: plan.tables, revision: plan.revision, plan };
}

// One editor session owns the revision that accompanied its draft. Background
// reads never replace edits; saving never refreshes that revision before PUT.
export function createLayoutSession() {
  let state = { tables: [], savedTables: [], plan: null, savedPlan: null, revision: null, loaded: false, dirty: false, busy: false, requiresReload: false };
  let sequence = 0;
  const listeners = new Set();
  function update(patch) {
    state = { ...state, ...patch };
    listeners.forEach(listener => listener());
  }
  return {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    edit(updater) {
      if (state.busy || !state.loaded) return;
      sequence += 1;
      update({ tables: typeof updater === "function" ? updater(state.tables) : updater, dirty: true });
    },
    async load({ request, baseUrl, normalize, discard = false, allowLegacy = true }) {
      if (state.busy) return false;
      const preserveDraft = !discard && (state.dirty || state.requiresReload);
      const current = ++sequence;
      update({ busy: true });
      try {
        const snapshot = await readSnapshot(request, baseUrl, allowLegacy);
        if (current !== sequence) return false;
        const unchanged = snapshot.plan && snapshot.revision === state.savedPlan?.revision;
        if (unchanged) snapshot.plan = state.savedPlan;
        const tables = unchanged ? state.savedTables : snapshot.tables.map(normalize);
        // Other operational screens can refresh saved table data without
        // displaying a local editor draft or changing that draft's revision.
        update(preserveDraft ? { savedTables: tables, savedPlan: snapshot.plan } : {
          ...snapshot, tables, savedTables: tables, savedPlan: snapshot.plan, loaded: true, dirty: false, requiresReload: false,
        });
        return !preserveDraft;
      } finally {
        if (current === sequence) update({ busy: false });
      }
    },
    async save({ request, baseUrl, normalize, allowLegacy = true }) {
      if (state.busy || !state.loaded || state.requiresReload) return false;
      sequence += 1;
      const draft = state;
      update({ busy: true });
      let acknowledged = false;
      try {
        const response = await request(`${baseUrl}/api/table-layouts`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            ...(draft.revision ? { "If-Match": `"${draft.revision}"` } : {}),
          },
          body: JSON.stringify(draft.tables),
        });
        if (!response.ok) {
          const body = await response.text();
          let message = body || "Failed to save table layout.";
          try { message = JSON.parse(body).message || message; } catch { /* Plain-text errors are supported. */ }
          throw requestError(response.status, message);
        }
        acknowledged = true;
        // A successful save may advance the revision. Read afterwards while
        // editing is disabled; never reuse the revision from before the write.
        const snapshot = await readSnapshot(request, baseUrl, allowLegacy);
        const tables = snapshot.tables.map(normalize);
        update({ ...snapshot, tables, savedTables: tables, savedPlan: snapshot.plan, dirty: false, requiresReload: false });
        return true;
      } catch (error) {
        if (acknowledged || !error.status || error.status === 409 || error.status === 428 || error.status >= 500) {
          update({ requiresReload: true });
        }
        throw Object.assign(error, { acknowledged });
      } finally {
        update({ busy: false });
      }
    },
  };
}
