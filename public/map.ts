// Tiled map loader and room definitions for Bahay ni Kuya

export type RoomId =
  | "bedroom"
  | "living"
  | "office"
  | "hallway"
  | "confession"
  | "kitchen"
  | "gameroom"
  | "gym";

export interface RoomInfo {
  id: RoomId;
  label: string;
  x: number; // tile x
  y: number; // tile y
  w: number; // tile width
  h: number; // tile height
  tint: string;
  cam: string;
}

export interface MapPOI {
  id: string;
  name: string;
  room: RoomId;
  x: number; // tile x
  y: number; // tile y
  facing: "up" | "down" | "left" | "right";
  action: string;
  tags: string[];
}

export interface HouseMap {
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  rooms: Record<RoomId, RoomInfo>;
  floor: number[];
  walls: number[];
  doors: number[];
  furniture: number[];
  collision: number[];
  pois: MapPOI[];
}

let loadedMap: HouseMap | null = null;

export async function loadHouseMap(): Promise<HouseMap> {
  if (loadedMap) return loadedMap;
  try {
    const res = await fetch("/map/house.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    const getLayer = (name: string): number[] => {
      const layer = json.layers?.find((l: { name: string }) => l.name === name);
      return layer ? layer.data : new Array(json.width * json.height).fill(0);
    };

    const poisLayer = json.layers?.find((l: { name: string }) => l.name === "pois");
    const pois: MapPOI[] = (poisLayer?.objects || []).map((o: any) => {
      const props: Record<string, string> = {};
      for (const p of o.properties || []) props[p.name] = p.value;
      return {
        id: o.name,
        name: props.label || o.name,
        room: (props.room as RoomId) || "hallway",
        x: Math.round(o.x / json.tilewidth),
        y: Math.round(o.y / json.tileheight),
        facing: (props.facing as any) || "down",
        action: props.action || "idle",
        tags: (props.tags || "").split(",").filter(Boolean),
      };
    });

    loadedMap = {
      width: json.width,
      height: json.height,
      tilewidth: json.tilewidth,
      tileheight: json.tileheight,
      rooms: json.rooms,
      floor: getLayer("floor"),
      walls: getLayer("walls"),
      doors: getLayer("doors"),
      furniture: getLayer("furniture"),
      collision: getLayer("collision"),
      pois,
    };
    return loadedMap;
  } catch (err) {
    console.warn("Could not load /map/house.json, using fallback", err);
    throw err;
  }
}
