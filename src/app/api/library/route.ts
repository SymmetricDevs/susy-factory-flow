import { NextResponse } from "next/server";
import type { LibraryListResponse } from "@/lib/library/sync-types";
import { LIBRARY_MAX_DESIGNS, LIBRARY_MAX_FOLDERS } from "@/lib/library/sync-types";
import { getCommunityDb, getSessionUser, isCommunityConfigured } from "@/lib/server/community";
import {
  DESIGN_META_COLUMNS,
  FOLDER_COLUMNS,
  libraryStorageErrorMessage,
  rowToDesignMeta,
  rowToFolder,
  type DesignRow,
  type FolderRow,
} from "@/lib/server/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The account's whole library, without plans: every design's metadata and
 * every folder, tombstones included. The browser reconciles against this
 * and fetches only the plans it is missing or that moved.
 */
export async function GET(request: Request) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Cloud storage is not configured." }, { status: 503 });
  }

  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in to sync your library." }, { status: 401 });
  }

  const db = getCommunityDb();
  const [designs, folders] = await Promise.all([
    db
      .from("library_designs")
      .select(DESIGN_META_COLUMNS)
      .eq("user_id", sessionUser.id)
      .order("updated_at", { ascending: false })
      .limit(LIBRARY_MAX_DESIGNS * 2),
    db
      .from("library_folders")
      .select(FOLDER_COLUMNS)
      .eq("user_id", sessionUser.id)
      .limit(LIBRARY_MAX_FOLDERS * 2),
  ]);
  const error = designs.error ?? folders.error;
  if (error) {
    return NextResponse.json(
      { error: libraryStorageErrorMessage(error, "Your library could not be loaded.") },
      { status: 500 },
    );
  }

  const response: LibraryListResponse = {
    designs: (designs.data as DesignRow[]).map(rowToDesignMeta),
    folders: (folders.data as FolderRow[]).map(rowToFolder),
  };
  return NextResponse.json(response);
}
