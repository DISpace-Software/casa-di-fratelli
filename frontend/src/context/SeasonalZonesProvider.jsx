import React from "react";
import { API_BASE_URL } from "../config/api";

import { SeasonalZonesContext } from "./SeasonalZonesContext";

export default function SeasonalZonesProvider({ children }) {
  const [closedAreas, setClosedAreas] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState("");
  const sequence = React.useRef(0);
  const updateZones = React.useCallback((data) => {
    sequence.current += 1;
    setClosedAreas(Array.isArray(data?.closedAreas) ? data.closedAreas : []);
    setLoaded(true);
    setError("");
  }, []);
  const reloadZones = React.useCallback(async () => {
    const request = ++sequence.current;
    try {
      const response = await fetch(`${API_BASE_URL}/api/seasonal-zones`, { cache: "no-store" });
      // Older API instances during a rolling deployment have no seasonal closures yet.
      if (response.status === 404) { if (request === sequence.current) updateZones({ closedAreas: [] }); return; }
      if (!response.ok) throw new Error("Failed to load seasonal zones.");
      const data = await response.json();
      if (request === sequence.current) updateZones(data);
    } catch (failure) {
      if (request === sequence.current) setError(failure.message);
    }
  }, [updateZones]);
  React.useEffect(() => {
    reloadZones();
    const refresh = () => { if (!document.hidden) reloadZones(); };
    const interval = window.setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { sequence.current += 1; window.clearInterval(interval); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [reloadZones]);
  const value = React.useMemo(() => ({ closedAreas, loaded, error, reloadZones, updateZones }), [closedAreas, loaded, error, reloadZones, updateZones]);
  return <SeasonalZonesContext.Provider value={value}>{children}</SeasonalZonesContext.Provider>;
}
