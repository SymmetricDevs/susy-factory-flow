import type { FactoryProject, FactoryStorage } from "@/lib/model/types";
import { edgeTouchesResource } from "./flow-explainers";
import type { RailPort } from "./node-verdict";
import {
  canonicalizeResourceHandleId,
  makeResourceHandleId,
  splitSectionHandleId,
} from "./resource-handles";

/**
 * THE FLOW NEIGHBOURHOOD a hover lights up: the wires on the thing you are
 * pointing at, the far-end port of each, and the cards involved. One module
 * so a port row and a drawer answer the same question the same way. Rules:
 *
 * - A SHARED MACHINE'S CARD holds several recipes, and a wire belongs to the
 *   SECTION its handle names (`r<n>:`, shared-machine.ts); matching on card
 *   and resource alone would light every section's wires from any one.
 * - A BUFFER PASSES IT ALONG: a drawer is a junction, not a destination.
 *   The walk carries on through drawers in the direction the hover asked
 *   about and stops at the first machine, so a chain of drawers reads as
 *   one hop.
 */
export interface FlowScope {
  edges: Record<string, true>;
  ports: Record<string, true>;
  nodes: Record<string, true>;
}

/** The far end's port key: its own handle, or the plain one for its resource. */
function farPortKey(
  farId: string,
  rawHandle: string | undefined,
  side: "input" | "output",
  edge: { resourceKind: string; resourceId: string },
): string {
  const handle =
    canonicalizeResourceHandleId(rawHandle) ??
    makeResourceHandleId(side, {
      kind: edge.resourceKind as "item" | "fluid" | "power",
      id: edge.resourceId,
    });
  return `${farId}|${handle}`;
}

/**
 * Walks on from every drawer already in the scope (header). `direction` is
 * the way the hover was asking: downstream from an output, upstream from an
 * input, both from a drawer itself. Each drawer is walked once, so a ring of
 * them terminates.
 */
function propagateThroughStorages(
  project: FactoryProject,
  scope: FlowScope,
  seeds: readonly string[],
  direction: "downstream" | "upstream" | "both",
): void {
  const storageIds = new Set((project.storages ?? []).map((storage) => storage.id));
  const queue = seeds.filter((id) => storageIds.has(id));
  const walked = new Set(queue);
  while (queue.length > 0) {
    const id = queue.shift()!;
    for (const edge of project.edges) {
      const leaves = edge.source === id;
      const arrives = edge.target === id;
      const follow =
        direction === "both" ? leaves || arrives : direction === "downstream" ? leaves : arrives;
      if (!follow) {
        continue;
      }
      scope.edges[edge.id] = true;
      const farId = leaves ? edge.target : edge.source;
      scope.nodes[farId] = true;
      scope.ports[
        farPortKey(farId, leaves ? edge.targetHandle : edge.sourceHandle, leaves ? "input" : "output", edge)
      ] = true;
      if (storageIds.has(farId) && !walked.has(farId)) {
        walked.add(farId);
        queue.push(farId);
      }
    }
  }
}

/** What a port row's hover lights: its own wires, and on through any drawer. */
export function buildPortFlowScope(
  project: FactoryProject,
  nodeId: string,
  port: Pick<RailPort, "side" | "kind" | "resourceId" | "handleId">,
): FlowScope {
  const scope: FlowScope = {
    edges: {},
    ports: { [`${nodeId}|${port.handleId}`]: true },
    nodes: { [nodeId]: true },
  };
  const isInput = port.side === "input";
  const section = splitSectionHandleId(port.handleId).section;
  const storageIds = new Set((project.storages ?? []).map((storage) => storage.id));
  const reached: string[] = [];
  for (const edge of project.edges) {
    if ((isInput ? edge.target : edge.source) !== nodeId) {
      continue;
    }
    // The section this wire lands on. A wire with no handle at all (an old
    // plan) belongs to the card, which is section 0 - the same answer
    // `splitSectionHandleId` gives it.
    const ownHandle = isInput ? edge.targetHandle : edge.sourceHandle;
    if (splitSectionHandleId(ownHandle).section !== section) {
      continue;
    }
    if (!edgeTouchesResource(edge, port.side, port.kind, port.resourceId)) {
      continue;
    }
    scope.edges[edge.id] = true;
    const farId = isInput ? edge.source : edge.target;
    scope.nodes[farId] = true;
    scope.ports[
      farPortKey(farId, isInput ? edge.sourceHandle : edge.targetHandle, isInput ? "output" : "input", edge)
    ] = true;
    if (storageIds.has(farId)) {
      reached.push(farId);
    }
  }
  propagateThroughStorages(project, scope, reached, isInput ? "upstream" : "downstream");
  return scope;
}

/**
 * What a drawer's hover lights: every wire on it, and on through the drawers
 * those reach, both ways (a drawer IS a port, so the card is the row). Only
 * wires connected to THIS drawer, not everything carrying its resource.
 */
export function buildStorageFlowScope(
  project: FactoryProject,
  storage: Pick<FactoryStorage, "id" | "kind" | "resourceId">,
): FlowScope {
  const resource = { kind: storage.kind, id: storage.resourceId };
  const scope: FlowScope = {
    edges: {},
    nodes: { [storage.id]: true },
    // The drawer's own two handles: whatever side a wire arrives on, the card
    // is the port it arrives at, so it wears the port rim rather than the
    // quieter node one.
    ports: {
      [`${storage.id}|${makeResourceHandleId("input", resource)}`]: true,
      [`${storage.id}|${makeResourceHandleId("output", resource)}`]: true,
    },
  };
  propagateThroughStorages(project, scope, [storage.id], "both");
  return scope;
}
