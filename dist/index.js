// src/parser/tree-sitter-loader.ts
import { Parser, Language } from "web-tree-sitter";
var parserInitialized = false;
async function initParser() {
  if (parserInitialized) return;
  await Parser.init();
  parserInitialized = true;
}
var languageCache = /* @__PURE__ */ new Map();
async function loadLanguage(name) {
  if (languageCache.has(name)) {
    return languageCache.get(name);
  }
  await initParser();
  const wasmPath = await getWasmPath(name);
  const language = await Language.load(wasmPath);
  languageCache.set(name, language);
  return language;
}
async function getWasmPath(name) {
  try {
    const { createRequire } = await import("module");
    const require2 = createRequire(import.meta.url);
    const wasmPath = require2.resolve(`tree-sitter-${name}/tree-sitter-${name}.wasm`);
    return wasmPath;
  } catch {
    return `node_modules/tree-sitter-${name}/tree-sitter-${name}.wasm`;
  }
}
async function parseFile(content, language) {
  const lang = await loadLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);
  const tree = parser.parse(content);
  if (!tree) {
    throw new Error(`Failed to parse file with language: ${language}`);
  }
  return tree;
}

// src/parser/typescript-extractor.ts
async function extractTypeScriptImports(filePath, content) {
  const tree = await parseFile(content, "typescript");
  const imports = [];
  visitNode(tree.rootNode, (node) => {
    if (node.type === "import_statement") {
      const imp = extractImportStatement(node, filePath, content);
      if (imp) imports.push(imp);
    } else if (node.type === "call_expression") {
      const imp = extractDynamicImport(node, filePath, content);
      if (imp) imports.push(imp);
    }
  });
  return { file: filePath, imports };
}
function extractImportStatement(node, file, content) {
  const sourceNode = node.childForFieldName("source");
  if (!sourceNode) return null;
  const from = extractStringValue(sourceNode, content);
  if (!from) return null;
  return {
    from,
    location: getLocation(node, file)
  };
}
function extractDynamicImport(node, file, content) {
  const func = node.childForFieldName("function");
  if (!func || func.text !== "import") return null;
  const args = node.childForFieldName("arguments");
  if (!args) return null;
  const firstArg = args.children.find((c) => c.type === "string" || c.type === "template_string");
  if (!firstArg) return null;
  const from = extractStringValue(firstArg, content);
  if (!from) return null;
  return {
    from,
    isDynamic: true,
    location: getLocation(node, file)
  };
}
function extractStringValue(node, _content) {
  const text = node.text;
  if (text.startsWith('"') || text.startsWith("'")) {
    return text.slice(1, -1);
  }
  if (text.startsWith("`")) {
    const withoutBackticks = text.slice(1, -1);
    if (!withoutBackticks.includes("${")) {
      return withoutBackticks;
    }
  }
  return null;
}
function getLocation(node, file) {
  return {
    file,
    line: node.startPosition.row + 1,
    column: node.startPosition.column
  };
}
function visitNode(node, visitor) {
  visitor(node);
  for (const child of node.children) {
    visitNode(child, visitor);
  }
}
async function extractJavaScriptImports(filePath, content) {
  return extractTypeScriptImports(filePath, content);
}

// src/parser/python-extractor.ts
async function extractPythonImports(filePath, content) {
  const tree = await parseFile(content, "python");
  const imports = [];
  visitNode2(tree.rootNode, (node) => {
    if (node.type === "import_statement" || node.type === "import_from_statement") {
      const imp = extractImport(node, filePath, content);
      if (imp) imports.push(imp);
    }
  });
  return { file: filePath, imports };
}
function extractImport(node, file, _content) {
  if (node.type === "import_statement") {
    return extractPlainImport(node, file);
  } else if (node.type === "import_from_statement") {
    return extractFromImport(node, file);
  }
  return null;
}
function extractPlainImport(node, file) {
  const nameNode = node.childForFieldName("name");
  if (!nameNode) return null;
  const moduleName = getModuleName(nameNode);
  if (!moduleName) return null;
  return {
    from: moduleName,
    location: getLocation2(node, file)
  };
}
function extractFromImport(node, file) {
  const moduleNode = node.childForFieldName("module_name");
  if (!moduleNode) return null;
  const moduleName = getModuleName(moduleNode);
  if (!moduleName) return null;
  return {
    from: moduleName,
    location: getLocation2(node, file)
  };
}
function getModuleName(node) {
  if (node.type === "dotted_name") {
    return node.text;
  } else if (node.type === "relative_import") {
    return node.text;
  } else if (node.type === "aliased_import") {
    const nameChild = node.childForFieldName("name");
    if (nameChild) {
      return getModuleName(nameChild);
    }
  }
  return node.text || null;
}
function getLocation2(node, file) {
  return {
    file,
    line: node.startPosition.row + 1,
    column: node.startPosition.column
  };
}
function visitNode2(node, visitor) {
  visitor(node);
  for (const child of node.children) {
    visitNode2(child, visitor);
  }
}

// src/resolver/index.ts
import * as fs from "fs/promises";
import * as path from "path";
async function resolveImports(fileImports, config) {
  const resolved = [];
  for (const { file, imports } of fileImports) {
    for (const imp of imports) {
      const resolvedPath = await resolveImport(imp.from, file, config);
      if (resolvedPath) {
        resolved.push({
          from: file,
          to: resolvedPath,
          location: imp.location
        });
      }
    }
  }
  return resolved;
}
async function resolveImport(importPath, fromFile, config) {
  if (isExternalModule(importPath)) {
    return null;
  }
  const fileExt = path.extname(fromFile);
  const isPython = fileExt === ".py";
  if (isPython) {
    return resolvePythonImport(importPath, fromFile, config);
  }
  return resolveTypeScriptImport(importPath, fromFile, config);
}
function isExternalModule(importPath) {
  return !importPath.startsWith(".") && !importPath.startsWith("/");
}
async function resolveTypeScriptImport(importPath, fromFile, config) {
  if (importPath.startsWith(".")) {
    return resolveRelativePath(importPath, fromFile, config);
  }
  if (config.tsconfig?.paths) {
    const aliasResolved = await resolvePathAlias(importPath, config);
    if (aliasResolved) return aliasResolved;
  }
  if (config.workspaces) {
    const workspaceResolved = await resolveWorkspace(importPath, config);
    if (workspaceResolved) return workspaceResolved;
  }
  return null;
}
async function resolveRelativePath(importPath, fromFile, config) {
  const dir = path.dirname(fromFile);
  let candidatePath = path.join(dir, importPath);
  const esmExt = path.extname(candidatePath);
  if (esmExt === ".js" || esmExt === ".mjs" || esmExt === ".cjs") {
    const basePath = candidatePath.slice(0, -esmExt.length);
    const tsExtensions = esmExt === ".mjs" ? [".mts"] : esmExt === ".cjs" ? [".cts"] : [".ts", ".tsx"];
    for (const tsExt of tsExtensions) {
      const tsPath = basePath + tsExt;
      if (await fileExists(path.join(config.rootDir, tsPath))) {
        return tsPath;
      }
    }
    candidatePath = basePath;
  }
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];
  for (const ext of extensions) {
    const withExt = candidatePath + ext;
    if (await fileExists(path.join(config.rootDir, withExt))) {
      return withExt;
    }
  }
  for (const ext of ["index.ts", "index.tsx", "index.js", "index.jsx"]) {
    const indexPath = path.join(candidatePath, ext);
    if (await fileExists(path.join(config.rootDir, indexPath))) {
      return indexPath;
    }
  }
  return null;
}
async function resolvePathAlias(importPath, config) {
  if (!config.tsconfig?.paths) return null;
  const { paths, baseUrl = "." } = config.tsconfig;
  for (const [pattern, mappings] of Object.entries(paths)) {
    const regex = patternToRegex(pattern);
    const match = importPath.match(regex);
    if (match) {
      for (const mapping of mappings) {
        const resolved = mapping.replace("*", match[1] || "");
        const fullPath = path.join(baseUrl, resolved);
        const candidate = await resolveRelativePath(`./${fullPath}`, "", {
          ...config,
          rootDir: config.rootDir
        });
        if (candidate) return candidate;
        if (await fileExists(path.join(config.rootDir, fullPath))) {
          return fullPath;
        }
      }
    }
  }
  return null;
}
async function resolveWorkspace(importPath, config) {
  if (!config.workspaces) return null;
  for (const workspace of config.workspaces) {
    const packageJsonPath = path.join(config.rootDir, workspace, "package.json");
    try {
      const content = await fs.readFile(packageJsonPath, "utf-8");
      const pkg = JSON.parse(content);
      if (pkg.name === importPath || importPath.startsWith(pkg.name + "/")) {
        const subpath = importPath.slice(pkg.name.length + 1) || ".";
        const mainFile = pkg.main || pkg.module || "index.js";
        if (subpath === ".") {
          return path.join(workspace, mainFile);
        }
        const resolved = await resolveRelativePath(`./${subpath}`, workspace, {
          ...config,
          rootDir: config.rootDir
        });
        if (resolved) return resolved;
      }
    } catch {
    }
  }
  return null;
}
async function resolvePythonImport(importPath, fromFile, config) {
  if (importPath.startsWith(".")) {
    return resolvePythonRelative(importPath, fromFile, config);
  }
  const parts = importPath.split(".");
  const possiblePaths = [
    path.join(...parts) + ".py",
    path.join(...parts, "__init__.py"),
    path.join("src", ...parts) + ".py",
    path.join("src", ...parts, "__init__.py")
  ];
  for (const possiblePath of possiblePaths) {
    if (await fileExists(path.join(config.rootDir, possiblePath))) {
      return possiblePath;
    }
  }
  return null;
}
async function resolvePythonRelative(importPath, fromFile, config) {
  const dir = path.dirname(fromFile);
  let targetDir = dir;
  const dots = importPath.match(/^\.+/)?.[0] || ".";
  const rest = importPath.slice(dots.length);
  for (let i = 1; i < dots.length; i++) {
    targetDir = path.dirname(targetDir);
  }
  if (rest) {
    const parts = rest.split(".");
    targetDir = path.join(targetDir, ...parts);
  }
  const candidatePath = targetDir + ".py";
  if (await fileExists(path.join(config.rootDir, candidatePath))) {
    return candidatePath;
  }
  const initPath = path.join(targetDir, "__init__.py");
  if (await fileExists(path.join(config.rootDir, initPath))) {
    return initPath;
  }
  return null;
}
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const withWildcard = escaped.replace(/\\\*/g, "(.*)");
  return new RegExp(`^${withWildcard}$`);
}
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
async function loadTsConfig(rootDir) {
  const tsconfigPath = path.join(rootDir, "tsconfig.json");
  try {
    const content = await fs.readFile(tsconfigPath, "utf-8");
    const tsconfig = JSON.parse(content);
    return {
      baseUrl: tsconfig.compilerOptions?.baseUrl,
      paths: tsconfig.compilerOptions?.paths
    };
  } catch {
    return null;
  }
}
async function findWorkspaces(rootDir) {
  const packageJsonPath = path.join(rootDir, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    if (pkg.workspaces) {
      const patterns = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
      const workspaces = [];
      for (const pattern of patterns) {
        if (!pattern.includes("*")) {
          workspaces.push(pattern);
        } else {
          const base = pattern.replace("/*", "");
          try {
            const entries = await fs.readdir(path.join(rootDir, base));
            for (const entry of entries) {
              const fullPath = path.join(base, entry);
              const pkgPath = path.join(rootDir, fullPath, "package.json");
              if (await fileExists(pkgPath)) {
                workspaces.push(fullPath);
              }
            }
          } catch {
          }
        }
      }
      return workspaces;
    }
  } catch {
  }
  return [];
}

// src/graph/index.ts
import * as path2 from "path";
function buildGraph(resolvedImports, allFiles, config = {}) {
  const { roots = ["src", "packages/*", "apps/*"], depth = 1 } = config;
  const fileToModule = /* @__PURE__ */ new Map();
  for (const file of allFiles) {
    const moduleName = getModuleName2(file, roots, depth);
    fileToModule.set(file, moduleName);
  }
  const moduleFiles = /* @__PURE__ */ new Map();
  for (const [file, module] of fileToModule) {
    if (!moduleFiles.has(module)) {
      moduleFiles.set(module, /* @__PURE__ */ new Set());
    }
    moduleFiles.get(module).add(file);
  }
  const edgeMap = /* @__PURE__ */ new Map();
  const externalDeps = /* @__PURE__ */ new Map();
  for (const resolved of resolvedImports) {
    const fromModule = fileToModule.get(resolved.from);
    const toModule = fileToModule.get(resolved.to);
    if (!fromModule || !toModule || fromModule === toModule) {
      continue;
    }
    if (!edgeMap.has(fromModule)) {
      edgeMap.set(fromModule, /* @__PURE__ */ new Map());
    }
    const fromEdges = edgeMap.get(fromModule);
    if (!fromEdges.has(toModule)) {
      fromEdges.set(toModule, {
        from: fromModule,
        to: toModule,
        weight: 0,
        locations: []
      });
    }
    const edge = fromEdges.get(toModule);
    edge.weight++;
    edge.locations.push(resolved.location);
  }
  const edges = [];
  for (const fromEdges of edgeMap.values()) {
    for (const edge of fromEdges.values()) {
      edges.push(edge);
    }
  }
  const fanIn = /* @__PURE__ */ new Map();
  const fanOut = /* @__PURE__ */ new Map();
  for (const edge of edges) {
    fanOut.set(edge.from, (fanOut.get(edge.from) || 0) + 1);
    fanIn.set(edge.to, (fanIn.get(edge.to) || 0) + 1);
  }
  const modules = [];
  for (const [moduleName, files] of moduleFiles) {
    modules.push({
      name: moduleName,
      files: Array.from(files).sort(),
      fanIn: fanIn.get(moduleName) || 0,
      fanOut: fanOut.get(moduleName) || 0,
      externalDeps: Array.from(externalDeps.get(moduleName) || []).sort()
    });
  }
  modules.sort((a, b) => a.name.localeCompare(b.name));
  const cycles = detectCycles(edges, modules.map((m) => m.name));
  return {
    modules,
    edges,
    cycles
  };
}
function getModuleName2(file, roots, depth) {
  const normalized = file.replace(/\\/g, "/");
  for (const root of roots) {
    if (root.endsWith("/*")) {
      const base = root.slice(0, -2);
      if (normalized.startsWith(base + "/")) {
        const rest = normalized.slice(base.length + 1);
        const parts2 = rest.split("/");
        if (parts2.length > 0) {
          return path2.join(base, parts2[0]);
        }
      }
    } else {
      if (normalized.startsWith(root + "/")) {
        const rest = normalized.slice(root.length + 1);
        const parts2 = rest.split("/");
        if (depth === 0) {
          return root;
        }
        const moduleParts = parts2.slice(0, depth);
        return path2.join(root, ...moduleParts);
      }
    }
  }
  const parts = normalized.split("/");
  if (parts.length > 0) {
    return parts[0];
  }
  return normalized;
}
function detectCycles(edges, modules) {
  const graph = /* @__PURE__ */ new Map();
  for (const module of modules) {
    graph.set(module, []);
  }
  for (const edge of edges) {
    if (!graph.has(edge.from)) {
      graph.set(edge.from, []);
    }
    graph.get(edge.from).push(edge.to);
  }
  return tarjan(graph);
}
function tarjan(graph) {
  let index = 0;
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const indices = /* @__PURE__ */ new Map();
  const lowlinks = /* @__PURE__ */ new Map();
  const sccs = [];
  function strongConnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    const neighbors = graph.get(v) || [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
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
function computeLOC(files) {
  const loc = /* @__PURE__ */ new Map();
  for (const [file, content] of files) {
    const lines = content.split("\n").filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("//") && !trimmed.startsWith("#");
    });
    loc.set(file, lines.length);
  }
  return loc;
}

// src/render/index.ts
import * as fs2 from "fs/promises";
import * as path3 from "path";
var START_MARKER = "<!-- archmap:start -->";
var END_MARKER = "<!-- archmap:end -->";
function renderMermaid(graph) {
  const sections = [];
  sections.push("# Architecture\n");
  sections.push(START_MARKER);
  sections.push("");
  sections.push("## Module Dependencies\n");
  sections.push("```mermaid");
  sections.push(renderMermaidGraph(graph));
  sections.push("```\n");
  sections.push("## Modules\n");
  sections.push(renderModuleTable(graph.modules));
  sections.push("");
  if (graph.cycles.length > 0) {
    sections.push("## \u26A0\uFE0F Cycles Detected\n");
    sections.push(renderCycles(graph.cycles));
    sections.push("");
  }
  sections.push(END_MARKER);
  return sections.join("\n");
}
function renderMermaidGraph(graph) {
  const lines = ["flowchart LR"];
  const edgesSorted = [...graph.edges].sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });
  for (const edge of edgesSorted) {
    const fromId = sanitizeId(edge.from);
    const toId = sanitizeId(edge.to);
    const label = edge.weight > 1 ? `|${edge.weight}|` : "";
    const arrow = label ? `-->${label}` : "-->";
    lines.push(`  ${fromId}[${edge.from}] ${arrow} ${toId}[${edge.to}]`);
  }
  if (edgesSorted.length === 0) {
    for (const module of graph.modules.slice(0, 5)) {
      const id = sanitizeId(module.name);
      lines.push(`  ${id}[${module.name}]`);
    }
  }
  return lines.join("\n");
}
function renderModuleTable(modules) {
  const lines = [
    "| Module | Files | Fan-In | Fan-Out | External Deps |",
    "|--------|-------|--------|---------|---------------|"
  ];
  const sorted = [...modules].sort((a, b) => {
    const fanA = a.fanIn + a.fanOut;
    const fanB = b.fanIn + b.fanOut;
    if (fanB !== fanA) return fanB - fanA;
    return a.name.localeCompare(b.name);
  });
  for (const module of sorted) {
    const externalDeps = module.externalDeps.length > 0 ? module.externalDeps.slice(0, 3).join(", ") + (module.externalDeps.length > 3 ? "..." : "") : "-";
    lines.push(
      `| \`${module.name}\` | ${module.files.length} | ${module.fanIn} | ${module.fanOut} | ${externalDeps} |`
    );
  }
  return lines.join("\n");
}
function renderCycles(cycles) {
  const lines = [];
  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i];
    lines.push(`${i + 1}. ${cycle.map((m) => `\`${m}\``).join(" \u2192 ")}`);
  }
  return lines.join("\n");
}
function sanitizeId(name) {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}
async function writeArchitectureFile(filePath, graph) {
  let existingContent = "";
  try {
    existingContent = await fs2.readFile(filePath, "utf-8");
  } catch {
  }
  const newContent = renderMermaid(graph);
  let finalContent;
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
      finalContent = newContent + "\n\n" + existingContent;
    }
  } else {
    finalContent = newContent;
  }
  await fs2.mkdir(path3.dirname(filePath), { recursive: true });
  await fs2.writeFile(filePath, finalContent, "utf-8");
}
function renderDeltaDiagram(addedEdges, removedEdges, touchedModules) {
  const lines = ["```mermaid", "flowchart LR"];
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
  lines.push("```");
  return lines.join("\n");
}

// src/lock/index.ts
import * as fs3 from "fs/promises";
var LOCK_VERSION = "1";
function graphToLock(graph) {
  const modules = graph.modules.map((m) => m.name).sort();
  const edges = graph.edges.map((e) => ({
    from: e.from,
    to: e.to,
    weight: e.weight
  })).sort((a, b) => {
    if (a.from !== b.from) return a.from.localeCompare(b.from);
    return a.to.localeCompare(b.to);
  });
  const externalDeps = {};
  for (const module of graph.modules) {
    if (module.externalDeps.length > 0) {
      externalDeps[module.name] = module.externalDeps.sort();
    }
  }
  return {
    version: LOCK_VERSION,
    modules,
    edges,
    externalDeps
  };
}
async function writeLockFile(filePath, lock) {
  const content = JSON.stringify(lock, null, 2) + "\n";
  await fs3.writeFile(filePath, content, "utf-8");
}
async function readLockFile(filePath) {
  try {
    const content = await fs3.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function diffLocks(oldLock, newLock, newGraph) {
  const oldEdges = oldLock?.edges || [];
  const newEdges = newLock.edges;
  const oldEdgeSet = new Set(oldEdges.map(edgeKey));
  const newEdgeSet = new Set(newEdges.map(edgeKey));
  const edgeLocationMap = /* @__PURE__ */ new Map();
  if (newGraph) {
    for (const edge of newGraph.edges) {
      edgeLocationMap.set(edgeKey(edge), edge);
    }
  }
  const added = [];
  const removed = [];
  for (const edge of newEdges) {
    if (!oldEdgeSet.has(edgeKey(edge))) {
      const fullEdge = edgeLocationMap.get(edgeKey(edge));
      added.push({
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        locations: fullEdge?.locations || []
      });
    }
  }
  for (const edge of oldEdges) {
    if (!newEdgeSet.has(edgeKey(edge))) {
      removed.push({
        from: edge.from,
        to: edge.to,
        weight: edge.weight,
        locations: []
      });
    }
  }
  const newCycles = detectNewCycles(oldLock, newLock);
  return {
    added,
    removed,
    newCycles
  };
}
function edgeKey(edge) {
  return `${edge.from}->${edge.to}`;
}
function detectNewCycles(oldLock, newLock) {
  if (!oldLock) {
    return [];
  }
  const oldCycles = findCyclesInLock(oldLock);
  const newCycles = findCyclesInLock(newLock);
  const oldCycleSet = new Set(oldCycles.map(cycleKey));
  const result = [];
  for (const cycle of newCycles) {
    if (!oldCycleSet.has(cycleKey(cycle))) {
      result.push(cycle);
    }
  }
  return result;
}
function findCyclesInLock(lock) {
  const graph = /* @__PURE__ */ new Map();
  for (const module of lock.modules) {
    graph.set(module, []);
  }
  for (const edge of lock.edges) {
    if (!graph.has(edge.from)) {
      graph.set(edge.from, []);
    }
    graph.get(edge.from).push(edge.to);
  }
  return tarjan2(graph);
}
function tarjan2(graph) {
  let index = 0;
  const stack = [];
  const onStack = /* @__PURE__ */ new Set();
  const indices = /* @__PURE__ */ new Map();
  const lowlinks = /* @__PURE__ */ new Map();
  const sccs = [];
  function strongConnect(v) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);
    const neighbors = graph.get(v) || [];
    for (const w of neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
      }
    }
    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do {
        w = stack.pop();
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
function cycleKey(cycle) {
  return cycle.sort().join("->");
}

// src/index.ts
var version = "0.1.0";
export {
  buildGraph,
  computeLOC,
  detectCycles,
  diffLocks,
  extractJavaScriptImports,
  extractPythonImports,
  extractTypeScriptImports,
  findWorkspaces,
  graphToLock,
  initParser,
  loadTsConfig,
  readLockFile,
  renderDeltaDiagram,
  renderMermaid,
  resolveImports,
  version,
  writeArchitectureFile,
  writeLockFile
};
//# sourceMappingURL=index.js.map