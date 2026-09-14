import Dexie, { type EntityTable } from "dexie";
import type { Set as PhytoSet, Gathering } from "./types";

export interface GatheringSet {
  id: string;
  gathering_id: string;
  set_id: string;
  position: number;
}

export class PhytoDB extends Dexie {
  sets!: EntityTable<PhytoSet, "id">;
  gatherings!: EntityTable<Gathering, "id">;
  gathering_sets!: EntityTable<GatheringSet, "id">;

  constructor() {
    super("PhytoDB");
    this.version(1).stores({
      sets: "id, createdAt, updatedAt",
      gatherings: "id, &share_token, createdAt, updatedAt",
      gathering_sets: "id, gathering_id, set_id, position",
    });
    this.version(2).stores({
      sets: "id, createdAt, updatedAt",
      gatherings: "id, share_token, createdAt, updatedAt",
      gathering_sets: "id, gathering_id, set_id, position",
    });
    // v3: index group_id so the library can be scoped to the active workspace
    // (personal = group_id absent/null). Additive index only; existing rows keep
    // their data and simply read as personal.
    this.version(3).stores({
      sets: "id, createdAt, updatedAt, group_id",
      gatherings: "id, share_token, createdAt, updatedAt, group_id",
      gathering_sets: "id, gathering_id, set_id, position",
    });
  }
}

export const db = new PhytoDB();
