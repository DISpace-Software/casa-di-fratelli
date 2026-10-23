import { createContext, useContext } from "react";

export const SeasonalZonesContext = createContext({ closedAreas: [], loaded: false, error: "", reloadZones: async () => {}, updateZones: () => {} });
export const useSeasonalZones = () => useContext(SeasonalZonesContext);
