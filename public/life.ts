// House Life autonomous POI scheduler and behavior manager for Bahay ni Kuya

import type { RoomId } from "./map.js";
import type { Action, Facing, Emote } from "./anim.js";

export interface POI {
  id: string;
  name: string;
  room: RoomId;
  x: number; // tile x
  y: number; // tile y
  facing: Facing;
  action: Action;
  minSec: number;
  maxSec: number;
  capacity: number;
  tags: string[];
}

export interface HousemateLifeState {
  key: string;
  harness: string;
  currentPoiId: string | null;
  previousPoiId: string | null;
  activityUntil: number;
  lastRoom: RoomId;
  roomVisits: Record<string, number>;
  isWorking: boolean;
  isSleeping: boolean;
  wakingUpUntil?: number;
}

export class HouseLifeManager {
  pois: POI[] = [];
  poisById = new Map<string, POI>();
  states = new Map<string, HousemateLifeState>();
  occupancy = new Map<string, Set<string>>(); // poiId -> Set of housemate keys

  constructor(pois: POI[] = []) {
    this.setPOIs(pois);
  }

  setPOIs(pois: POI[]): void {
    this.pois = [...pois];
    this.poisById.clear();
    this.occupancy.clear();
    for (const p of pois) {
      this.poisById.set(p.id, p);
      this.occupancy.set(p.id, new Set());
    }
  }

  getPOI(id: string): POI | undefined {
    return this.poisById.get(id);
  }

  getOccupants(poiId: string): string[] {
    return Array.from(this.occupancy.get(poiId) || []);
  }

  isAtCapacity(poiId: string): boolean {
    const poi = this.poisById.get(poiId);
    if (!poi) return true;
    const current = this.occupancy.get(poiId)?.size || 0;
    return current >= poi.capacity;
  }

  reservePOI(charKey: string, poiId: string): boolean {
    const poi = this.poisById.get(poiId);
    if (!poi || this.isAtCapacity(poiId)) return false;

    // Release any previously held POI
    this.releasePOI(charKey);

    const set = this.occupancy.get(poiId);
    if (set) {
      set.add(charKey);
      const state = this.states.get(charKey);
      if (state) {
        state.previousPoiId = state.currentPoiId;
        state.currentPoiId = poiId;
        state.lastRoom = poi.room;
        state.roomVisits[poi.room] = (state.roomVisits[poi.room] || 0) + 1;
      }
      return true;
    }
    return false;
  }

  releasePOI(charKey: string): void {
    for (const [poiId, set] of this.occupancy.entries()) {
      if (set.has(charKey)) {
        set.delete(charKey);
      }
    }
    const state = this.states.get(charKey);
    if (state && state.currentPoiId) {
      state.previousPoiId = state.currentPoiId;
      state.currentPoiId = null;
    }
  }

  getOrCreateState(key: string, harness: string): HousemateLifeState {
    let s = this.states.get(key);
    if (!s) {
      s = {
        key,
        harness,
        currentPoiId: null,
        previousPoiId: null,
        activityUntil: 0,
        lastRoom: "living",
        roomVisits: { living: 0, kitchen: 0, gameroom: 0, gym: 0, bedroom: 0, office: 0 },
        isWorking: false,
        isSleeping: false,
      };
      this.states.set(key, s);
    }
    return s;
  }

  /**
   * Pick a weighted random POI for an idle housemate.
   * Guarantees:
   * 1. No immediate repeat of previousPoiId
   * 2. Strict capacity checking
   * 3. Even distribution across non-office, non-bedroom rooms
   */
  pickIdlePOI(charKey: string, now: number): POI | null {
    const state = this.getOrCreateState(charKey, "");

    // Valid idle rooms
    const targetRooms: RoomId[] = ["living", "kitchen", "gameroom", "gym"];

    // Eligible POIs that have capacity and are NOT an immediate repeat
    const eligible = this.pois.filter((p) => {
      if (!targetRooms.includes(p.room)) return false;
      if (p.id === state.previousPoiId) return false;
      if (this.isAtCapacity(p.id)) return false;
      return true;
    });

    if (eligible.length === 0) {
      // Fallback: any available POI in target rooms
      const fallback = this.pois.filter(
        (p) => targetRooms.includes(p.room) && !this.isAtCapacity(p.id),
      );
      if (fallback.length === 0) return null;
      return fallback[Math.floor(Math.random() * fallback.length)];
    }

    // Weight inversely to room visits to avoid pileups in any one room (e.g. living room)
    const weights: number[] = [];
    let totalWeight = 0;

    for (const p of eligible) {
      const visits = state.roomVisits[p.room] || 0;
      // Rooms with fewer visits get significantly higher weight
      const weight = Math.max(1, 10 - visits * 2);
      weights.push(weight);
      totalWeight += weight;
    }

    let rnd = Math.random() * totalWeight;
    let chosen = eligible[0];
    for (let i = 0; i < eligible.length; i++) {
      rnd -= weights[i];
      if (rnd <= 0) {
        chosen = eligible[i];
        break;
      }
    }

    // Reserve chosen POI and schedule duration
    this.reservePOI(charKey, chosen.id);
    const durationSec = chosen.minSec + Math.random() * (chosen.maxSec - chosen.minSec);
    state.activityUntil = now + durationSec * 1000;

    return chosen;
  }

  /** Pick a bed in the bedroom for a sleeping housemate */
  pickBedPOI(charKey: string): POI | null {
    const state = this.getOrCreateState(charKey, "");
    const beds = this.pois.filter((p) => p.room === "bedroom" && !this.isAtCapacity(p.id));
    if (beds.length === 0) {
      return this.pois.find((p) => p.room === "bedroom") || null;
    }
    const chosen = beds[0];
    this.reservePOI(charKey, chosen.id);
    state.isSleeping = true;
    state.isWorking = false;
    return chosen;
  }

  /** Pick a desk in the office for a working session */
  pickDeskPOI(charKey: string, isSubagent = false): POI | null {
    const state = this.getOrCreateState(charKey, "");
    state.isWorking = true;
    state.isSleeping = false;

    let desks: POI[] = [];
    if (isSubagent) {
      desks = this.pois.filter(
        (p) => p.room === "office" && p.tags.includes("subagent") && !this.isAtCapacity(p.id),
      );
      if (desks.length === 0) {
        desks = this.pois.filter((p) => p.room === "office" && !this.isAtCapacity(p.id));
      }
    } else {
      desks = this.pois.filter(
        (p) => p.room === "office" && p.tags.includes("primary") && !this.isAtCapacity(p.id),
      );
      if (desks.length === 0) {
        desks = this.pois.filter((p) => p.room === "office" && !this.isAtCapacity(p.id));
      }
    }

    if (desks.length === 0) {
      return this.pois.find((p) => p.room === "office") || null;
    }
    const chosen = desks[0];
    this.reservePOI(charKey, chosen.id);
    return chosen;
  }

  /** Remove a housemate who left */
  removeHousemate(charKey: string): void {
    this.releasePOI(charKey);
    this.states.delete(charKey);
  }
}
