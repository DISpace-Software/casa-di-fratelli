import { createContext, useContext } from "react";

export const EMPTY_FLOOR_PLAN = Object.freeze({ schemaVersion: 1, revision: "", zones: [], tables: [], combinations: [], publicMaxGuests: 8, publicMaxTables: 1 });
export const FloorPlanContext = createContext(null);
export function useFloorPlan() {
  const value = useContext(FloorPlanContext);
  if (!value) throw new Error("FloorPlanProvider is required.");
  return value;
}
