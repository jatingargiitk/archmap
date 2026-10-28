import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { Graph, Module, ModuleEdge } from '../types.js';

const START_MARKER = '<!-- archmap:start -->';
const END_MARKER = '<!-- archmap:end -->';

export function renderMermaid(graph: Graph): string {
  const sections: string[] = [];

  sections.push('# Architecture\n');
  sections.push(START_MARKER);
  sections.push('');
  sections.push('## Module Dependencies\n');
  sections.push('```mermaid');
  sections.push(renderMermaidGraph(graph));
  sections.push('```\n');

  sections.push('## Modules\n');
  sections.push(renderModuleTable(graph.modules));
  sections.push('');

  if (graph.cycles.length > 0) {
    sections.push('## ⚠️ Cycles Detected\n');
    sections.push(renderCycles(graph.cycles));
    sections.push('');
  }

  sections.push(END_MARKER);

  return sections.join('\n');
}

function renderMermaidGraph(graph: Graph): string {
  const lines: string[] = ['flowchart LR'];

  const edgesSorted = [...graph.edges].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });

  for (const edge of edgesSorted) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    const label = edge.weight > 1 ? `|${edge.weight}|` : '';
    const arrow = label ? `-->${label}` : '-->';
    lines.push(`  ${fromId}[${edge.from}] ${arrow} ${toId}[${edge.to}]`);
  }

  if (edgesSorted.length === 0) {
    for (const module of graph.modules.slice(0, 5)) {
      const id = sanitizeId(module.name);
      lines.push(`  ${id}[${module.name}]`);
    }
  }

  return lines.join('\n');
}

function renderModuleTable(modules: Module[]): string {
  const lines: string[] = [
    '| Module | Files | Fan-In | Fan-Out | External Deps |',
    '|--------|-------|--------|---------|---------------|',
  ];

  const sorted = [...modules].sort((a, b) => {
    const fanA = a.fanIn + a.fanOut;
    const fanB = b.fanIn + b.fanOut;
    if (fanB !== fanA) return fanB - fanA;
    return a.name.localeCompare(b.name);
  });

  for (const module of sorted) {
    const externalDeps = module.externalDeps.length > 0
      ? module.externalDeps.slice(0, 3).join(', ') +
        (module.externalDeps.length > 3 ? '...' : '')
      : '-';

    lines.push(
      `| \`${module.name}\` | ${module.files.length} | ${module.fanIn} | ${module.fanOut} | ${externalDeps} |`
    );
  }

  return lines.join('\n');
}

function renderCycles(cycles: string[][]): string {
  const lines: string[] = [];

  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    lines.push(`${i + 1}. ${cycle.map(m => `\`${m}\``).join(' → ')}`);
  }

  return lines.join('\n');
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_');
}

export async function writeArchitectureFile(
  filePath: string,
  graph: Graph
): Promise<void> {
  let existingContent = '';
  
  try {
    existingContent = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist, that's fine
  }

  const newContent = renderMermaid(graph);

  let finalContent: string;

  if (existingContent) {
    const startIndex = existingContent.indexOf(START_MARKER);
    const endIndex = existingContent.indexOf(END_MARKER);

    if (startIndex !== -1 && endIndex !== -1) {
      const before = existingContent.slice(0, startIndex);
      const after = existingContent.slice(endIndex + END_MARKER.length);
      
      const extractedSection = newContent.slice(
        newContent.indexOf(START_MARKER),
        newContent.indexOf(END_MARKER) + END_MARKER.length
      );

      finalContent = before + extractedSection + after;
    } else {
      finalContent = newContent + '\n\n' + existingContent;
    }
  } else {
    finalContent = newContent;
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, finalContent, 'utf-8');
}

export function renderDeltaDiagram(
  addedEdges: ModuleEdge[],
  removedEdges: ModuleEdge[],
  touchedModules: Set<string>
): string {
  const lines: string[] = ['```mermaid', 'flowchart LR'];
  
  for (const module of touchedModules) {
    const id = sanitizeId(module);
    lines.push(`  ${id}[${module}]`);
  }

  let edgeIndex = 0;

  for (const edge of addedEdges) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    lines.push(`  ${fromId} ====> ${toId}`);
    lines.push(`  linkStyle ${edgeIndex} stroke:#00ff00,stroke-width:3px`);
    edgeIndex++;
  }

  for (const edge of removedEdges) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    lines.push(`  ${fromId} -.-> ${toId}`);
    lines.push(`  linkStyle ${edgeIndex} stroke:#ff0000,stroke-width:2px,stroke-dasharray:5`);
    edgeIndex++;
  }

  lines.push('```');

  return lines.join('\n');
}
