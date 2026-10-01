import { redirect } from "next/navigation";

/**
 * The community hub lives inside the planner. Legacy /community links
 * redirect: /community?plan=x becomes /?plan=x, everything else goes home.
 */
export default async function CommunityRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const plan = typeof params.plan === "string" ? params.plan : undefined;
  redirect(plan ? `/?plan=${encodeURIComponent(plan)}` : "/");
}
