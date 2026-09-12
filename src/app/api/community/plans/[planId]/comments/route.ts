import { NextResponse } from "next/server";
import { COMMUNITY_COMMENT_MAX_LENGTH, type CommunityComment } from "@/lib/community/types";
import {
  checkRateLimit,
  communityStorageErrorMessage,
  getCommunityDb,
  getSessionUser,
  isCommunityConfigured,
  recountPlanComments,
} from "@/lib/server/community";
import { invalidatePlanListCache } from "@/lib/server/plan-list-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ planId: string }> };

/** Newest last, the way a thread reads. Deleted ones are simply not here. */
const COMMENT_COLUMNS = "id,plan_id,user_id,author_name,body,created_at";
const COMMENT_LIMIT = 300;

interface CommentRow {
  id: string;
  plan_id: string;
  user_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

function rowToComment(
  row: CommentRow,
  viewer: { id: string; is_admin: boolean } | undefined,
  planOwnerId: string | undefined,
): CommunityComment {
  const isMine = Boolean(viewer && row.user_id === viewer.id);
  return {
    id: row.id,
    planId: row.plan_id,
    authorName: row.author_name,
    body: row.body,
    createdAt: row.created_at,
    isMine,
    canDelete: Boolean(viewer && (isMine || viewer.is_admin || viewer.id === planOwnerId)),
  };
}

/** Anyone may read the comments on a public post; the owner may read their own private one's. */
async function loadPlanOwner(planId: string): Promise<{ user_id: string; is_public: boolean } | undefined> {
  const { data } = await getCommunityDb()
    .from("community_plans")
    .select("user_id,is_public")
    .eq("id", planId)
    .maybeSingle<{ user_id: string; is_public: boolean }>();
  return data ?? undefined;
}

export async function GET(request: Request, context: RouteContext) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Community hub is not configured." }, { status: 503 });
  }
  const { planId } = await context.params;
  const [plan, viewer] = await Promise.all([loadPlanOwner(planId), getSessionUser(request)]);
  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }
  if (!plan.is_public && plan.user_id !== viewer?.id && !viewer?.is_admin) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  const { data, error } = await getCommunityDb()
    .from("community_comments")
    .select(COMMENT_COLUMNS)
    .eq("plan_id", planId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(COMMENT_LIMIT)
    .returns<CommentRow[]>();
  if (error) {
    return NextResponse.json(
      { error: communityStorageErrorMessage(error, "Comments could not be loaded.") },
      { status: 500 },
    );
  }
  return NextResponse.json({
    comments: (data ?? []).map((row) => rowToComment(row, viewer, plan.user_id)),
  });
}

export async function POST(request: Request, context: RouteContext) {
  if (!isCommunityConfigured()) {
    return NextResponse.json({ error: "Community hub is not configured." }, { status: 503 });
  }
  const sessionUser = await getSessionUser(request);
  if (!sessionUser) {
    return NextResponse.json({ error: "Sign in to comment." }, { status: 401 });
  }
  if (!(await checkRateLimit(`user:${sessionUser.id}`, "comment", 40, 60 * 60))) {
    return NextResponse.json({ error: "Commenting too fast. Try again later." }, { status: 429 });
  }

  const { planId } = await context.params;
  const plan = await loadPlanOwner(planId);
  if (!plan || (!plan.is_public && plan.user_id !== sessionUser.id)) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  let text = "";
  try {
    const body = (await request.json()) as { body?: unknown };
    text = typeof body.body === "string" ? body.body.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!text || text.length > COMMUNITY_COMMENT_MAX_LENGTH) {
    return NextResponse.json(
      { error: `A comment runs 1 to ${COMMUNITY_COMMENT_MAX_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const { data, error } = await getCommunityDb()
    .from("community_comments")
    .insert({
      plan_id: planId,
      user_id: sessionUser.id,
      author_name: sessionUser.username,
      body: text,
    })
    .select(COMMENT_COLUMNS)
    .single<CommentRow>();
  if (error || !data) {
    return NextResponse.json(
      { error: communityStorageErrorMessage(error, "The comment could not be posted.") },
      { status: 500 },
    );
  }
  await recountPlanComments(planId).catch(() => undefined);
  invalidatePlanListCache();
  return NextResponse.json({ comment: rowToComment(data, sessionUser, plan.user_id) });
}
