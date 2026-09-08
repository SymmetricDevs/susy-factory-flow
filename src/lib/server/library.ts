import type { EntryIcon } from "@/lib/model/types";
import type { RemoteDesignMeta, RemoteFolder } from "@/lib/library/sync-types";
import { parseEntryIcon } from "./community";

/** Everything the list endpoint returns about a design: no plan. */
export const DESIGN_META_COLUMNS =
  "id,name,icon,folder_id,closed,favorite,sort_order,community_plan_id,created_at,updated_at,plan_updated_at,deleted_at";

export const FOLDER_COLUMNS = "id,name,created_at,updated_at,deleted_at";

export interface DesignRow {
  id: string;
  name: string;
  icon: unknown;
  folder_id: string | null;
  closed: boolean;
  favorite: boolean;
  sort_order: number | null;
  community_plan_id: string | null;
  created_at: string;
  updated_at: string;
  plan_updated_at: string;
  deleted_at: string | null;
}

export interface FolderRow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function rowToDesignMeta(row: DesignRow): RemoteDesignMeta {
  return {
    id: row.id,
    name: row.name,
    icon: parseEntryIcon(row.icon) as EntryIcon | null,
    folderId: row.folder_id,
    closed: row.closed,
    favorite: row.favorite === true,
    order: row.sort_order,
    communityPlanId: row.community_plan_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    planUpdatedAt: row.plan_updated_at,
    deletedAt: row.deleted_at,
  };
}

export function rowToFolder(row: FolderRow): RemoteFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

/**
 * A missing or stale table says so by name: the schema is pasted by hand,
 * and the app has to tell "not set up yet" from "broken".
 */
export function libraryStorageErrorMessage(
  error: { code?: string; message?: string } | null,
  fallback: string,
): string {
  if (error?.code === "PGRST205" || error?.code === "42P01") {
    return "Library sync is not set up yet: run supabase/schema.sql in the Supabase SQL editor.";
  }
  if (error?.code === "PGRST204" || error?.code === "42703") {
    return "Library sync is out of date: re-run the latest supabase/schema.sql in the Supabase SQL editor.";
  }
  // Anything else: say what the database said, so the strip's red line
  // names the cause instead of hiding it behind a fallback.
  return error?.message ? `${fallback} ${error.message}` : fallback;
}

/** True for a well-formed ISO timestamp the client is allowed to stamp. */
export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value));
}

/** Ids are client-minted: a UUID, or the older `design-<base36>` form. */
export function isLibraryId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}
