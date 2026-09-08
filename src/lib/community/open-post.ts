"use client";

import {
  downloadCommunityPlan,
  getCommunityPlan,
  tagPlanWithCommunityId,
  untagCommunityPlan,
} from "@/lib/community/client";
import { parseFactoryProjectJson } from "@/lib/import-export";
import { applyPlanView } from "@/lib/plan-view";
import { useDesignStore } from "@/store/design-store";

/**
 * The one way a community post opens, from anywhere (a tile, a menu, the
 * Welcome page, a pasted link):
 *
 * - YOUR post is your design. If the design is in this library, it opens.
 *   If it is not (another browser, no account sync), it comes down as that
 *   design, linked, and the post follows it from then on.
 * - Someone else's post opens as a COPY: a plain design of your own, with no
 *   link back, that you can post later as an ordinary post of yours.
 *
 * `isMine` is read from the summary when the caller has one; a bare id
 * (a pasted link) asks the server first.
 */
export async function openCommunityPost(plan: {
  id: string;
  name?: string;
  isMine?: boolean;
}): Promise<"opened" | "copied"> {
  const store = useDesignStore.getState();
  const existing = store.designs.find((design) => design.communityPlanId === plan.id);
  if (existing) {
    await store.switchToDesign(existing.id);
    return "opened";
  }

  let isMine = plan.isMine;
  let name = plan.name;
  if (isMine === undefined) {
    // A background lookup: opening is what counts the view, and the
    // download below is that.
    const summary = await getCommunityPlan(plan.id, { countView: false });
    isMine = summary.isMine === true;
    name = name ?? summary.name;
  }

  const { plan: planJson, name: postName } = await downloadCommunityPlan(plan.id);
  const tagged = isMine
    ? tagPlanWithCommunityId(planJson, plan.id)
    : untagCommunityPlan(planJson);
  const project = parseFactoryProjectJson(JSON.stringify(tagged));
  // The post's name first: it is the one on the tile just clicked.
  await useDesignStore
    .getState()
    .importProjectAsDesign(project, name || postName || project.name);
  applyPlanView(project.view);
  return isMine ? "opened" : "copied";
}
