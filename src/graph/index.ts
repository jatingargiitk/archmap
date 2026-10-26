import * as path from 'node:path';
import type { ResolvedImport, Module, ModuleEdge, Graph } from '../types.js';

export interface ModuleConfig {
  roots?: string[];
  depth?: number;
}

export function buildGraph(
  resolvedImports: ResolvedImport[],
  allFiles: string[],
  config: ModuleConfig = {}
): Graph {
  const { roots = ['src', 'packages/*', 'apps/*'], depth = 1 } = config;

  const fileToModule = new Map<string, string>();
  
  for (const file of allFiles) {
    const moduleName = getModuleName(file, roots, depth);
    fileToModule.set(file, moduleName);
  }

  const moduleFiles = new Map<string, Set<string>>();
  for (const [file, module] of fileToModule) {
    if (!moduleFiles.has(module)) {
      moduleFiles.set(module, new Set());
    }
    moduleFiles.get(module)!.add(file);
  }

  const edgeMap = new Map<string, Map<string, ModuleEdge>>();
  const externalDeps = new Map<string, Set<string>>();

  for (const resolved of resolvedImports) {
    const fromModule = fileToModule.get(resolved.from);
    const toModule = fileToModule.get(resolved.to);

    if (!fromModule || !toModule || fromModule === toModule) {
      continue;
    }

    if (!edgeMap.has(fromModule)) {
      edgeMap.set(fromModule, new Map());
    }

    const fromEdges = edgeMap.get(fromModule)!;
    
    if (!fromEdges.has(toModule)) {
      fromEdges.set(toModule, {
        from: fromModule,
        to: toModule,
        weight: 0,
        locations: [],
      });
    }

    const edge = fromEdges.get(toModule)!;
    edge.weight++;
    edge.locations.push(resolved.location);
  }

  const edges: ModuleEdge[] = [];
  for (const fromEdges of edgeMap.values()) {
    for (const edge of fromEdges.values()) {
      edges.push(edge);
    }
  }

  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();

  for (const edge of edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) || 0) + 1);
    fanIn.set(edge.to, (fanIn.get(edge.to) || 0) + 1);
  }

  const modules: Module[] = [];
  for (const [moduleName, files] of moduleFiles) {
    modules.push({
      name: moduleName,
      files: Array.from(files).sort(),
      fanIn: fanIn.get(moduleName) || 0,
      fanOut: fanOut.get(moduleName) || 0,
      externalDeps: Array.from(externalDeps.get(moduleName) || []).sort(),
    });
  }

  modules.sort((a, b) => a.name.localeCompare(b.name));

  const cycles = detectCycles(edges, modules.map(m => m.name));

  return {
    modules,
    edges,
    cycles,
  };
}

function getModuleName(file: string, roots: string[], depth: number): string {
  const normalized = file.replace(/\\/g, '/');
  
  for (const root of roots) {
    if (root.endsWith('/*')) {
      const base = root.slice(0, -2);
      if (normalized.startsWith(base + '/')) {
        const rest = normalized.slice(base.length + 1);
        const parts = rest.split('/');
        if (parts.length > 0) {
          return path.join(base, parts[0]);
        }
      }
    } else {
      if (normalized.startsWith(root + '/')) {
        const rest = normalized.slice(root.length + 1);
        const parts = rest.split('/');
        if (depth === 0) {
          return root;
        }
        const moduleParts = parts.slice(0, depth);
        return path.join(root, ...moduleParts);
      }
    }
  }

  const parts = normalized.split('/');
  if (parts.length > 0) {
    return parts[0];
  }

  return normalized;
}

export function detectCycles(edges: ModuleEdge[], modules: string[]): string[][] {
  const graph = new Map<string, string[]>();
  
  for (const module of modules) {
    graph.set(module, []);
  }

  for (const edge of edges) {
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

export function computeLOC(files: Map<string, string>): Map<string, number> {
  const loc = new Map<string, number>();

  for (const [file, content] of files) {
    const lines = content.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith('//') && !trimmed.startsWith('#');
    });
    loc.set(file, lines.length);
  }

  return loc;
}
