import { NextResponse } from "next/server";
import {
  LIBRARY_FOLDER_NAME_MAX_LENGTH,
  LIBRARY_MAX_FOLDERS,
  type FolderUpsertBody,
} from "@/lib/library/sync-types";
import {
  checkRateLimit,
  getCommunityDb,
  getSessionUser,
  isCommunityConfigured,
} from "@/lib/server/community";
import {
  FOLDER_COLUMNS,
  isIsoTimestamp,
  isLibraryId,
  libraryStorageErrorMessage,
  rowToFolder,
  type FolderRow,
} from "@/lib/server/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ folderId: string }> };

/** Upsert, client timestamps, newer row wins: see the designs route. */
export async function PUT(request: Request, context: RouteContext) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Cloud storage is not configured." }, { status: 503 });
  }
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in to sync your library." }, { status: 401 });
  }
  if (!(await checkRateLimit(`user:${sessionUser.id}`, "library-folder", 300, 60 * 60))) {
    return NextResponse.json({ error: "Saving too fast. Try again later." }, { status: 429 });
  }

  const { folderId } = await context.params;
  if (!isLibraryId(folderId)) {
    return NextResponse.json({ error: "Bad folder id." }, { status: 400 });
  }
  let body: Partial<FolderUpsertBody>;
  try {
    body = (await request.json()) as Partial<FolderUpsertBody>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > LIBRARY_FOLDER_NAME_MAX_LENGTH) {
    return NextResponse.json({ error: "Folder names run 1 to 60 characters." }, { status: 400 });
  }
  if (!isIsoTimestamp(body.createdAt) || !isIsoTimestamp(body.updatedAt)) {
    return NextResponse.json({ error: "Bad timestamps." }, { status: 400 });
  }

  const db = getCommunityDb();
  const { data: existing, error: readError } = await db
    .from("library_folders")
    .select(FOLDER_COLUMNS)
    .eq("user_id", sessionUser.id)
    .eq("id", folderId)
    .maybeSingle();
  if (readError) {
    return NextResponse.json(
      { error: libraryStorageErrorMessage(readError, "The folder could not be saved.") },
      { status: 500 },
    );
  }
  const current = existing as FolderRow | null;
  if (current && Date.parse(current.updated_at) > Date.parse(body.updatedAt)) {
    return NextResponse.json({ folder: rowToFolder(current), behind: true });
  }
  if (!current) {
    const { count } = await db
      .from("library_folders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", sessionUser.id)
      .is("deleted_at", null);
    if ((count ?? 0) >= LIBRARY_MAX_FOLDERS) {
      return NextResponse.json({ error: "Too many folders." }, { status: 409 });
    }
  }

  const { data, error } = await db
    .from("library_folders")
    .upsert(
      {
        user_id: sessionUser.id,
        id: folderId,
        name,
        created_at: body.createdAt,
        updated_at: body.updatedAt,
        deleted_at: null,
      },
      { onConflict: "user_id,id" },
    )
    .select(FOLDER_COLUMNS)
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: libraryStorageErrorMessage(error, "The folder could not be saved.") },
      { status: 500 },
    );
  }
  return NextResponse.json({ folder: rowToFolder(data as FolderRow), behind: false });
}

export async function DELETE(request: Request, context: RouteContext) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Cloud storage is not configured." }, { status: 503 });
  }
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in to sync your library." }, { status: 401 });
  }

  const { folderId } = await context.params;
  const now = new Date().toISOString();
  const db = getCommunityDb();
  const { error } = await db
    .from("library_folders")
    .update({ deleted_at: now, updated_at: now })
    .eq("user_id", sessionUser.id)
    .eq("id", folderId);
  if (error) {
    return NextResponse.json(
      { error: libraryStorageErrorMessage(error, "The folder could not be deleted.") },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, deletedAt: now });
}
