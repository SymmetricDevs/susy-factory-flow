import { NextResponse } from "next/server";
import { BOARD_IMAGE_MAX_BYTES } from "@/lib/community/types";
import { PLAN_PREVIEW_BUCKET, getPlanPreviewPng } from "@/lib/server/plan-preview";
import {
  getCommunityDb,
  getSessionUser,
  isCommunityConfigured,
} from "@/lib/server/community";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The board photograph a shared link unfurls into. Stored in its own public
 * bucket AT the plan's id — no schema column, no URL to validate: the card
 * route derives the object name from the id it already has, and re-sharing
 * overwrites in place.
 *
 * Owner-only, unlike board-image uploads: this picture becomes the plan's
 * public face in every chat the link is pasted into, so only the person who
 * owns the post gets to stamp it.
 */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

let bucketReady = false;

async function ensureBucket(): Promise<void> {
  if (bucketReady) {
    return;
  }
  const db = getCommunityDb();
  const { data } = await db.storage.getBucket(PLAN_PREVIEW_BUCKET);
  if (!data) {
    const { error } = await db.storage.createBucket(PLAN_PREVIEW_BUCKET, {
      public: true,
      fileSizeLimit: BOARD_IMAGE_MAX_BYTES,
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Preview storage bucket could not be created: ${error.message}`);
    }
  }
  bucketReady = true;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Community hub is not configured." }, { status: 503 });
  }

  try {
    const { planId } = await params;
    const sessionUser = await getSessionUser(request);
    if (!sessionUser) {
      return NextResponse.json({ error: "Sign in to update your post." }, { status: 401 });
    }

    const db = getCommunityDb();
    const { data: existing } = await db
      .from("community_plans")
      .select("id,user_id")
      .eq("id", planId)
      .single<{ id: string; user_id: string | null }>();

    if (!existing) {
      return NextResponse.json({ error: "Plan not found." }, { status: 404 });
    }
    if (existing.user_id !== sessionUser.id && !sessionUser.is_admin) {
      return NextResponse.json({ error: "You don't own this post." }, { status: 403 });
    }

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "No image in the upload." }, { status: 400 });
    }
    if (file.size > BOARD_IMAGE_MAX_BYTES) {
      return NextResponse.json(
        { error: "That preview is too big: the limit is 4 MB." },
        { status: 413 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length < 8 || !PNG_MAGIC.every((byte, index) => bytes[index] === byte)) {
      return NextResponse.json({ error: "The preview must be a PNG." }, { status: 415 });
    }

    await ensureBucket();
    // Short cache: the same object name is overwritten on every re-share, so
    // a hot CDN copy must age out quickly enough for updates to show.
    const { error } = await db.storage
      .from(PLAN_PREVIEW_BUCKET)
      .upload(`${existing.id}.png`, bytes, {
        contentType: "image/png",
        cacheControl: "300",
        upsert: true,
      });
    if (error) {
      return NextResponse.json(
        { error: `Preview upload failed: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview upload failed." },
      { status: 500 },
    );
  }
}

/**
 * The photograph itself, for the library's preview page. Anyone may look:
 * it is the same picture every chat unfurl already shows.
 */
export async function GET(_request: Request, context: { params: Promise<{ planId: string }> }) {
  const { planId } = await context.params;
  const png = await getPlanPreviewPng(planId);
  if (!png) {
    return NextResponse.json({ error: "No preview." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Re-sharing overwrites in place, so a short cache keeps it honest.
      "Cache-Control": "public, max-age=300",
    },
  });
}
