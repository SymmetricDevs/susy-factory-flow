import { NextResponse } from "next/server";
import {
  communityStorageErrorMessage,
  getCommunityDb,
  getSessionUser,
  isCommunityConfigured,
  recountPlanComments,
} from "@/lib/server/community";
import { invalidatePlanListCache } from "@/lib/server/plan-list-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ planId: string; commentId: string }> };

/**
 * Takes a comment down: its author, the post's owner or an admin may. A
 * tombstone, not a hole, so the thread keeps its shape server-side.
 */
export async function DELETE(request: Request, context: RouteContext) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Community hub is not configured." }, { status: 503 });
  }
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in to manage comments." }, { status: 401 });
  }

  const { planId, commentId } = await context.params;
  const db = getCommunityDb();
  const [{ data: comment }, { data: plan }] = await Promise.all([
    db
      .from("community_comments")
      .select("id,user_id")
      .eq("id", commentId)
      .eq("plan_id", planId)
      .is("deleted_at", null)
      .maybeSingle<{ id: string; user_id: string }>(),
    db
      .from("community_plans")
      .select("user_id")
      .eq("id", planId)
      .maybeSingle<{ user_id: string }>(),
  ]);
  if (!comment || !plan) {
    return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  }
  const allowed =
    comment.user_id === sessionUser.id || plan.user_id === sessionUser.id || sessionUser.is_admin;
  if (!allowed) {
    return NextResponse.json({ error: "Not your comment." }, { status: 403 });
  }

  const { error } = await db
    .from("community_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  if (error) {
    return NextResponse.json(
      { error: communityStorageErrorMessage(error, "The comment could not be deleted.") },
      { status: 500 },
    );
  }
  await recountPlanComments(planId).catch(() => undefined);
  invalidatePlanListCache();
  return NextResponse.json({ ok: true });
}
