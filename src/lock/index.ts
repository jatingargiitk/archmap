import * as fs from 'node:fs/promises';
import type { Graph, LockFile, GraphDiff, ModuleEdge } from '../types.js';

const LOCK_VERSION = '1';

export function graphToLock(graph: Graph): LockFile {
  const modules = graph.modules.map(m => m.name).sort();
  
  const edges = graph.edges
    .map(e => ({
      from: e.from,
      to: e.to,
      weight: e.weight,
    }))
    .sort((a, b) => {
      if (a.from !== b.from) return a.from.localeCompare(b.from);
      return a.to.localeCompare(b.to);
    });

  const externalDeps: Record<string, string[]> = {};
  for (const module of graph.modules) {
    if (module.externalDeps.length > 0) {
      externalDeps[module.name] = module.externalDeps.sort();
    }
  }

  return {
    version: LOCK_VERSION,
    modules,
    edges,
    externalDeps,
  };
}

export async function writeLockFile(filePath: string, lock: LockFile): Promise<void> {
  const content = JSON.stringify(lock, null, 2) + '\n';
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readLockFile(filePath: string): Promise<LockFile | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function diffLocks(oldLock: LockFile | null, newLock: LockFile, newGraph?: Graph): GraphDiff {
  const oldEdges = oldLock?.edges || [];
  const newEdges = newLock.edges;

  const oldEdgeSet = new Set(oldEdges.map(edgeKey));
  const newEdgeSet = new Set(newEdges.map(edgeKey));

  // Build a map from edge key to full edge with locations (B6)
  const edgeLocationMap = new Map<string, ModuleEdge>();
  if (newGraph) {
    for (const edge of newGraph.edges) {
      edgeLocationMap.set(edgeKey(edge), edge);
    }
  }

  const added: ModuleEdge[] = [];
  const removed: ModuleEdge[] = [];

  for (const edge of newEdges) {
    if (!oldEdgeSet.has(edgeKey(edge))) {
      const fullEdge = edgeLocationMap.get(edgeKey(edge));
      added.push({
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        locations: fullEdge?.locations || [],
      });
    }
  }

  for (const edge of oldEdges) {
    if (!newEdgeSet.has(edgeKey(edge))) {
      removed.push({
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        locations: [],
      });
    }
  }

  const newCycles = detectNewCycles(oldLock, newLock);

  return {
    added,
    removed,
    newCycles,
  };
}

function edgeKey(edge: { from: string; to: string }): string {
  return `${edge.from}->${edge.to}`;
}

function detectNewCycles(oldLock: LockFile | null, newLock: LockFile): string[][] {
  if (!oldLock) {
    return [];
  }

  const oldCycles = findCyclesInLock(oldLock);
  const newCycles = findCyclesInLock(newLock);

  const oldCycleSet = new Set(oldCycles.map(cycleKey));
  const result: string[][] = [];

  for (const cycle of newCycles) {
    if (!oldCycleSet.has(cycleKey(cycle))) {
      result.push(cycle);
    }
  }

  return result;
}

function findCyclesInLock(lock: LockFile): string[][] {
  const graph = new Map<string, string[]>();

  for (const module of lock.modules) {
    graph.set(module, []);
  }

  for (const edge of lock.edges) {
    if (!graph.has(edge.from)) {
      graph.set(edge.from, []);
    }
    graph.get(edge.from)!.push(edge.to);
  }

  return tarjan(graph);
}

function tarjan(graph: Map<string, string[]>): string[][] {
  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = graph.get(v) || [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      if (scc.length > 1) {
        sccs.push(scc.sort());
      }
    }
  }

  for (const v of graph.keys()) {
    if (!indices.has(v)) {
      strongConnect(v);
    }
  }

  return sccs;
}

function cycleKey(cycle: string[]): string {
  return cycle.sort().join('->');
}
