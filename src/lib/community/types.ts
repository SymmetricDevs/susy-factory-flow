import type {
  EntryIcon,
  MachineTier,
  ResourceIconAtlasRef,
  ResourceKind,
} from "@/lib/model/types";

/**
 * The face an entry wears in a list: one item or fluid the author picked.
 * Defined with the model now that a plan carries its own; re-exported here so
 * every community consumer keeps its import.
 */
export type { EntryIcon } from "@/lib/model/types";

/** One line of a plan's stat card: an external need or an unconsumed output. */
export interface PlanResourceStat {
  kind: ResourceKind;
  resourceId: string;
  displayName?: string;
  /** items/s or L/s, positive. */
  ratePerSecond: number;
  /** Icon refs copied out of the plan JSON so cards can render real sprites. */
  iconPath?: string;
  iconAtlas?: ResourceIconAtlasRef;
  dominantColor?: string;
}

/** The sortable/filterable identity of a shared plan, computed from its JSON. */
export interface CommunityPlanStats {
  nodeCount: number;
  storageCount: number;
  edgeCount: number;
  /** Sum of configured machine counts across nodes. */
  machineCount: number;
  totalEuT: number;
  highestTier?: Exclude<MachineTier, "DEMO">;
  highestTierIndex: number;
  needs: PlanResourceStat[];
  outputs: PlanResourceStat[];
}

export interface CommunityPlanSummary extends CommunityPlanStats {
  id: string;
  name: string;
  description: string;
  gameVersion: string;
  datasetVersionId: string;
  /** Author-curated tags, normalized lowercase — same rules as blueprints. */
  tags: string[];
  /** On the network. Private posts live only on the owner's Mine shelf. */
  isPublic: boolean;
  /** The item face the author picked for list rows, if any. */
  icon?: EntryIcon;
  upvotes: number;
  downvotes: number;
  score: number;
  downloads: number;
  views: number;
  createdAt: string;
  /** Last touch of any kind: content overwrite or relabel. */
  updatedAt?: string;
  /** Live comments on it, and when the latest landed. */
  commentCount: number;
  lastCommentAt?: string;
  /** The later of the last edit and the last comment. */
  lastActivityAt?: string;
  authorName?: string;
  /** True when the signed-in user owns this post. */
  isMine?: boolean;
  /** This device's current vote, when known. */
  myVote?: 1 | -1;
}

export type CommunityPlanSort =
  | "new"
  | "top"
  | "downloads"
  | "views"
  | "machines"
  | "nodes"
  | "power"
  | "lowPower" // least EU/t first
  | "tier" // highest voltage tier first
  | "comments" // most comments
  | "commented" // latest comment first
  | "active"; // latest edit or comment first

export interface CommunityPlanListRequest {
  sort?: CommunityPlanSort;
  search?: string;
  maxTier?: string;
  /** Only the signed-in user's own posts. */
  mine?: boolean;
  /** Exact game version, e.g. "2.8.0". */
  gameVersion?: string;
  /** Posts drawing more than this many EU/t are left out. */
  maxEuT?: number;
  /** "kind:resourceId" keys the post must make / take, all of them. */
  makes?: string[];
  takes?: string[];
  page?: number;
  pageSize?: number;
  deviceId?: string;
}

export interface CommunityPlanListResponse {
  plans: CommunityPlanSummary[];
  total: number;
  page: number;
  pageSize: number;
  /** Every game version currently present in the hub, newest-ish first. */
  gameVersions: string[];
}

export interface CommunityUploadRequest {
  name: string;
  description: string;
  gameVersion: string;
  datasetVersionId: string;
  deviceId: string;
  /** Full FactoryProject JSON; the server re-validates and re-derives stats. */
  plan: unknown;
  tags?: string[];
  icon?: EntryIcon;
}

export interface CommunityUploadResponse {
  id: string;
}

export interface CommunityUser {
  username: string;
  isAdmin?: boolean;
}

export interface CommunityVoteRequest {
  deviceId: string;
  value: 1 | -1;
}

export interface CommunityVoteResponse {
  upvotes: number;
  downvotes: number;
  score: number;
  myVote?: 1 | -1;
}

export const COMMUNITY_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
/** Board image uploads (the picture annotation): hard cap, client and server. */
export const BOARD_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const COMMUNITY_NAME_MAX_LENGTH = 80;
export const COMMUNITY_DESCRIPTION_MAX_LENGTH = 2000;
export const COMMUNITY_RESOURCE_STAT_LIMIT = 40;

/** One comment on a shared setup, as the browser sees it. */
export interface CommunityComment {
  id: string;
  planId: string;
  authorName: string;
  body: string;
  createdAt: string;
  /** Written by the signed-in user. */
  isMine: boolean;
  /** The signed-in user may delete it: their own, or on their own post. */
  canDelete: boolean;
}

export const COMMUNITY_COMMENT_MAX_LENGTH = 2000;
