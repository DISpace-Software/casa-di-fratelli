import React from "react";

const RESTAURANT_SCENES = Object.freeze({
  indoor: {
    material: "wood",
    windows: [
      { id: "north-west", x: 1.2, y: 3, w: 2.2, h: 48, vertical: true },
      { id: "south-west", x: 1.2, y: 70, w: 2.2, h: 27, vertical: true },
    ],
    walls: [{ id: "hall-divider", x: 50, y: 50, w: 48, h: 2.2 }],
    entrances: [
      { id: "main", x: 0, y: 60, edge: "left", label: "entrance" },
      { id: "terrace", x: 45, y: 100, edge: "bottom", label: "terraceEntrance" },
    ],
    aquariums: [{ id: "hall-aquarium", x: 20, y: 5, w: 24, h: 5 }],
    plants: [
      { id: "north-west", x: 7, y: 8, size: "lg", rotation: -18 },
      { id: "north-east", x: 93, y: 9, size: "sm", rotation: 31 },
      { id: "south-east", x: 92, y: 88, size: "md", rotation: 74 },
    ],
    lights: [{ x: 30, y: 3 }, { x: 70, y: 3 }, { x: 96, y: 34 }],
  },
  garden: {
    material: "stone",
    windows: [
      { id: "north", x: 3, y: 1.5, w: 94, h: 2.2 },
      { id: "west", x: 1.2, y: 3, w: 2.2, h: 94, vertical: true },
      { id: "east", x: 96.6, y: 3, w: 2.2, h: 94, vertical: true },
    ],
    entrances: [{ id: "terrace", x: 50, y: 100, edge: "bottom", label: "terraceEntrance" }],
    plants: [
      { id: "north-west", x: 7, y: 8, size: "md", rotation: -14 },
      { id: "north-east", x: 92, y: 10, size: "lg", rotation: 42 },
      { id: "south-west", x: 7, y: 90, size: "sm", rotation: 92 },
      { id: "south-east", x: 92, y: 88, size: "md", rotation: 138 },
    ],
    lights: [{ x: 25, y: 3 }, { x: 74, y: 3 }],
  },
  openTerrace: {
    material: "stone",
    windows: [],
    entrances: [{ id: "restaurant", x: 50, y: 0, edge: "top", label: "restaurantEntrance" }],
    plants: [
      { id: "west", x: 5, y: 50, size: "sm", rotation: 8 },
      { id: "east", x: 95, y: 50, size: "sm", rotation: 51 },
      { id: "south-west", x: 6, y: 88, size: "md", rotation: 104 },
      { id: "south-east", x: 94, y: 88, size: "md", rotation: 149 },
    ],
    lights: [{ x: 30, y: 96 }, { x: 70, y: 96 }],
  },
});

const UNIFIED_SCENE_OVERRIDES = Object.freeze({
  indoor: {
    windows: [
      { id: "south-west", x: 2, y: 96, w: 50, h: 2.2 },
      { id: "south-east", x: 70, y: 96, w: 28, h: 2.2 },
    ],
    walls: [{ id: "hall-divider", x: 51, y: 3, w: 2.2, h: 50, vertical: true }],
    entrances: [
      { id: "main", x: 60, y: 100, edge: "bottom", label: "entrance" },
      { id: "terrace", x: 100, y: 60, edge: "right", label: "terraceEntrance" },
    ],
    aquariums: [{ id: "hall-aquarium", x: 10, y: 5, w: 26, h: 5 }],
  },
  garden: {
    windows: [
      { id: "north", x: 3, y: 1.5, w: 94, h: 2.2 },
      { id: "east", x: 96.6, y: 3, w: 2.2, h: 94, vertical: true },
    ],
    entrances: [{ id: "terrace", x: 0, y: 60, edge: "left", label: "terraceEntrance" }],
  },
});

function percentRect(item) {
  return { left: `${item.x}%`, top: `${item.y}%`, width: `${item.w}%`, height: `${item.h}%` };
}

function RestaurantWindow({ item, label }) {
  return (
    <div className={`map-architectural-window ${item.vertical ? "is-vertical" : ""}`} style={percentRect(item)}>
      <i className="map-window-glass" />
      <span>{label}</span>
    </div>
  );
}

function RestaurantWall({ item, label }) {
  return (
    <div className={`map-architectural-wall ${item.vertical ? "is-vertical" : ""}`} style={percentRect(item)}>
      <span>{label}</span>
    </div>
  );
}

function RestaurantEntrance({ item, label }) {
  return (
    <div className={`map-architectural-entry entry-${item.edge}`} style={{ left: `${item.x}%`, top: `${item.y}%` }}>
      <i className="map-entry-door" />
      <span>{label}</span>
    </div>
  );
}

function RestaurantAquarium({ item }) {
  return (
    <div className="map-aquarium" style={percentRect(item)}>
      <span className="map-aquarium-water" />
      <i /><i /><i />
      <b /><b /><b />
    </div>
  );
}

function RestaurantPlant({ item }) {
  return (
    <div
      className={`map-plant plant-${item.size}`}
      style={{ left: `${item.x}%`, top: `${item.y}%`, "--plant-turn": `${item.rotation}deg` }}
    >
      <i /><i /><i /><i /><i /><b />
    </div>
  );
}

function AmbientLight({ item }) {
  return <i className="map-ambient-light" style={{ left: `${item.x}%`, top: `${item.y}%` }} />;
}

export default function RestaurantMapScene({ area, labels = {}, mode = "operational", orientation = "section" }) {
  const base = RESTAURANT_SCENES[area] || RESTAURANT_SCENES.indoor;
  const scene = orientation === "unified" ? { ...base, ...(UNIFIED_SCENE_OVERRIDES[area] || {}) } : base;
  const text = {
    windows: "ПРОЗОРЦИ",
    wall: "СТЕНА",
    entrance: "ВХОД",
    terraceEntrance: "ВХОД КЪМ ТЕРАСАТА",
    restaurantEntrance: "ВХОД В РЕСТОРАНТА",
    ...labels,
  };

  return (
    <div
      className={`restaurant-scene scene-${scene.material} scene-${mode} scene-${orientation}`}
      data-area={area}
      aria-hidden="true"
    >
      <div className="restaurant-floor-layer" />
      <div className="restaurant-architecture-layer">
        {(scene.windows || []).map((item) => <RestaurantWindow key={item.id} item={item} label={text.windows} />)}
        {(scene.walls || []).map((item) => <RestaurantWall key={item.id} item={item} label={text.wall} />)}
        {(scene.entrances || []).map((item) => <RestaurantEntrance key={item.id} item={item} label={text[item.label]} />)}
      </div>
      <div className="restaurant-decoration-layer">
        {(scene.aquariums || []).map((item) => <RestaurantAquarium key={item.id} item={item} />)}
        {(scene.plants || []).map((item) => <RestaurantPlant key={item.id} item={item} />)}
        {(scene.lights || []).map((item, index) => <AmbientLight key={`${item.x}-${item.y}-${index}`} item={item} />)}
      </div>
      <div className="restaurant-labels-layer" />
      {mode === "edit" ? <div className="restaurant-editor-grid" /> : null}
    </div>
  );
}
