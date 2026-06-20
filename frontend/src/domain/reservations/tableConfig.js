export const RESERVATION_BUFFER_MINUTES = 180;

export const defaultGardenTables = [
  { id: "42", x: 17, y: 22, seats: 4 },
  { id: "43", x: 17, y: 42, seats: 4 },
  { id: "44", x: 17, y: 62, seats: 4 },
  { id: "45", x: 17, y: 82, seats: 4 },
  { id: "38", x: 38, y: 24, seats: 4 },
  { id: "39", x: 38, y: 44, seats: 4 },
  { id: "40", x: 38, y: 64, seats: 4 },
  { id: "41", x: 38, y: 84, seats: 4 },
  { id: "34", x: 59, y: 24, seats: 4 },
  { id: "35", x: 59, y: 44, seats: 4 },
  { id: "36", x: 59, y: 64, seats: 4 },
  { id: "37", x: 59, y: 84, seats: 4 },
  { id: "30", x: 78, y: 22, seats: 4 },
  { id: "31", x: 78, y: 42, seats: 4 },
  { id: "32", x: 78, y: 62, seats: 4 },
  { id: "33", x: 78, y: 82, seats: 4 },
  { id: "34A", x: 58, y: 10, seats: 2, special: true },
  { id: "30A", x: 75, y: 10, seats: 2, special: true },
  { id: "45A", x: 28, y: 93, seats: 2, special: true },
];

export const defaultIndoorTables = [
  { id: "1", x: 83, y: 12, seats: 4, wide: true },
  { id: "2", x: 83, y: 22, seats: 4, wide: true },
  { id: "3", x: 83, y: 32, seats: 4, wide: true },
  { id: "4", x: 83, y: 42, seats: 4, wide: true },
  { id: "5", x: 51, y: 22, seats: 6, wide: true },
  { id: "6", x: 51, y: 35, seats: 6, wide: true },
  { id: "7", x: 16, y: 10, seats: 4, wide: true },
  { id: "8", x: 16, y: 20, seats: 6, wide: true },
  { id: "9", x: 16, y: 30, seats: 6, wide: true },
  { id: "10", x: 16, y: 40, seats: 6, wide: true },
  { id: "11", x: 16, y: 50, seats: 6, wide: true },
  { id: "20", x: 82, y: 60, seats: 4, wide: true },
  { id: "21", x: 82, y: 70, seats: 4, wide: true },
  { id: "22", x: 82, y: 80, seats: 4, wide: true },
  { id: "23", x: 82, y: 90, seats: 4, wide: true },
  { id: "24", x: 53, y: 65, seats: 6, wide: true },
  { id: "25", x: 54, y: 78, seats: 6 },
  { id: "26", x: 55, y: 90, seats: 4, wide: true },
  { id: "27", x: 35, y: 92, seats: 4, wide: true },
  { id: "28", x: 16, y: 90, seats: 6, wide: true },
  { id: "29", x: 16, y: 80, seats: 6, wide: true },
];

export const defaultOpenTerraceTables = [
  { id: "46", x: 34, y: 40, seats: 4 },
  { id: "47", x: 66, y: 40, seats: 4 },
  { id: "48", x: 34, y: 68, seats: 2, special: true },
  { id: "49", x: 66, y: 68, seats: 2, special: true },
];

export const gardenGroups = [
  ["42", "43", "44", "45"],
  ["38", "39", "40", "41"],
  ["34", "35", "36", "37"],
  ["30", "31", "32", "33"],
];

export const indoorGroups = [
  ["5", "6"],
  ["20", "21", "22", "23"],
  ["28", "29"],
];

export const openTerraceGroups = [
  ["46", "47"],
  ["48", "49"],
];

export const reservationTimes = Array.from({ length: 55 }, (_, index) => {
  const totalMinutes = 10 * 60 + index * 15;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
});

export const tableIdsByArea = {
  indoor: defaultIndoorTables.map((table) => table.id),
  garden: defaultGardenTables.map((table) => table.id),
  openTerrace: defaultOpenTerraceTables.map((table) => table.id),
};

tableIdsByArea.all = [
  ...tableIdsByArea.indoor,
  ...tableIdsByArea.garden,
  ...tableIdsByArea.openTerrace,
];

export const tablesByArea = {
  indoor: defaultIndoorTables,
  garden: defaultGardenTables,
  openTerrace: defaultOpenTerraceTables,
};

tablesByArea.all = [
  ...tablesByArea.indoor,
  ...tablesByArea.garden,
  ...tablesByArea.openTerrace,
];
