#!/usr/bin/env node
import {
  buildGraph,
  checkRules,
  diffLocks,
  extractPythonImports,
  extractTypeScriptImports,
  findWorkspaces,
  graphToLock,
  loadTsConfig,
  renderDeltaDiagram,
  resolveImports,
  shouldFailCheck,
  writeArchitectureFile,
  writeLockFile
} from "./chunk-UVZVBM2N.js";

// src/action.ts
import * as fs from "fs/promises";
import { readFileSync } from "fs";
import * as path from "path";
import { execSync } from "child_process";
async function runAction() {
  const githubContext = getGitHubContext();
  const rootDir = process.env.GITHUB_WORKSPACE || process.cwd();
  console.log("\u{1F50D} Analyzing architecture...");
  const config = await loadConfig(rootDir);
  const currentGraph = await analyzeRepo(rootDir, config);
  const currentLock = graphToLock(currentGraph);
  await writeArchitectureFile(
    path.join(rootDir, "ARCHITECTURE.md"),
    currentGraph
  );
  await writeLockFile(path.join(rootDir, "archmap.lock.json"), currentLock);
  if (githubContext.eventName === "pull_request") {
    await handlePullRequest(rootDir, currentGraph, currentLock, config, githubContext);
  } else if (githubContext.eventName === "push") {
    await handlePush(rootDir, githubContext);
  }
}
async function handlePullRequest(rootDir, currentGraph, currentLock, config, context) {
  console.log("\u{1F4CA} Computing diff...");
  let baseLock = null;
  try {
    const baseLockContent = execSync(
      `git show origin/${context.baseRef}:archmap.lock.json`,
      { cwd: rootDir, encoding: "utf-8" }
    );
    baseLock = JSON.parse(baseLockContent);
  } catch {
    console.log("\u26A0\uFE0F  No lock file found in base branch");
  }
  const diff = diffLocks(baseLock, currentLock, currentGraph);
  const violations = checkRules(currentGraph.edges, config);
  const commentBody = buildCommentBody(diff, violations, currentGraph);
  if (process.env.GITHUB_TOKEN && context.prNumber) {
    await postOrUpdateComment(context, commentBody);
  } else {
    console.log("Comment preview:");
    console.log(commentBody);
  }
  const shouldFail = shouldFailCheck(diff, violations, config);
  if (shouldFail) {
    console.log("\u274C Check failed");
    process.exit(1);
  } else {
    console.log("\u2705 Check passed");
  }
}
async function handlePush(rootDir, context) {
  if (context.ref === `refs/heads/${context.defaultBranch}`) {
    console.log("\u{1F504} Committing updated architecture files...");
    try {
      execSync('git config user.name "archmap[bot]"', { cwd: rootDir });
      execSync('git config user.email "archmap[bot]@users.noreply.github.com"', { cwd: rootDir });
      execSync("git add ARCHITECTURE.md archmap.lock.json", { cwd: rootDir });
      try {
        execSync('git commit -m "chore: update architecture map [skip ci]"', { cwd: rootDir });
        execSync(`git push origin ${context.defaultBranch}`, { cwd: rootDir });
        console.log("\u2705 Architecture files updated");
      } catch {
        console.log("\u2139\uFE0F  No changes to commit");
      }
    } catch (error) {
      console.log("\u26A0\uFE0F  Could not commit changes:", error.message);
    }
  }
}
function buildCommentBody(diff, violations, _graph) {
  const lines = [];
  lines.push("## \u{1F5FA}\uFE0F archmap");
  lines.push("");
  const summary = `**${diff.added.length > 0 ? "+" : ""}${diff.added.length} new edge${diff.added.length !== 1 ? "s" : ""}, ${diff.removed.length > 0 ? "-" : ""}${diff.removed.length} removed**`;
  lines.push(summary);
  lines.push("");
  if (violations.length > 0) {
    lines.push("### \u26A0\uFE0F Rule Violations");
    lines.push("");
    for (const violation of violations) {
      lines.push(`- ${violation.message}`);
      lines.push(`  - Rule: \`${violation.rule}\``);
    }
    lines.push("");
  }
  if (diff.added.length > 0 || diff.removed.length > 0) {
    const touchedModules = /* @__PURE__ */ new Set();
    for (const edge of diff.added) {
      touchedModules.add(edge.from);
      touchedModules.add(edge.to);
    }
    for (const edge of diff.removed) {
      touchedModules.add(edge.from);
      touchedModules.add(edge.to);
    }
    lines.push("### Changes");
    lines.push("");
    lines.push(renderDeltaDiagram(diff.added, diff.removed, touchedModules));
    lines.push("");
    if (diff.added.length > 0) {
      lines.push("#### Added Dependencies");
      lines.push("");
      for (const edge of diff.added) {
        if (edge.locations && edge.locations.length > 0) {
          const loc = edge.locations[0];
          lines.push(`- \`${edge.from}\` \u2192 \`${edge.to}\` ([${loc.file}:${loc.line}](${loc.file}#L${loc.line}))`);
        } else {
          lines.push(`- \`${edge.from}\` \u2192 \`${edge.to}\``);
        }
      }
      lines.push("");
    }
    if (diff.removed.length > 0) {
      lines.push("#### Removed Dependencies");
      lines.push("");
      for (const edge of diff.removed) {
        lines.push(`- \`${edge.from}\` \u2192 \`${edge.to}\``);
      }
      lines.push("");
    }
  }
  if (diff.newCycles.length > 0) {
    lines.push("### \u26A0\uFE0F New Cycles");
    lines.push("");
    for (const cycle of diff.newCycles) {
      lines.push(`- ${cycle.map((m) => `\`${m}\``).join(" \u2192 ")}`);
    }
    lines.push("");
  }
  if (diff.added.length === 0 && diff.removed.length === 0 && violations.length === 0) {
    lines.push("\u2705 No architectural changes detected");
  } else {
    lines.push("---");
    lines.push("");
    lines.push("To accept these changes, run:");
    lines.push("```bash");
    lines.push("npx @jatingargiitk/archmap accept");
    lines.push("git add ARCHITECTURE.md archmap.lock.json");
    lines.push('git commit -m "chore: update architecture map"');
    lines.push("```");
  }
  lines.push("");
  lines.push("<!-- archmap-comment -->");
  return lines.join("\n");
}
async function postOrUpdateComment(context, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return;
  const [owner, repo] = context.repository.split("/");
  const issueNumber = context.prNumber;
  try {
    const existingComments = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "archmap"
        }
      }
    );
    const comments = await existingComments.json();
    const existingComment = comments.find(
      (c) => c.body.includes("<!-- archmap-comment -->")
    );
    if (existingComment) {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/comments/${existingComment.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "archmap"
          },
          body: JSON.stringify({ body })
        }
      );
      console.log("\u2705 Updated existing comment");
    } else {
      await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "User-Agent": "archmap"
          },
          body: JSON.stringify({ body })
        }
      );
      console.log("\u2705 Posted new comment");
    }
  } catch (error) {
    console.log("\u26A0\uFE0F  Could not post comment:", error.message);
  }
}
function getGitHubContext() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  let event = {};
  if (eventPath) {
    try {
      const eventData = readFileSync(eventPath, "utf-8");
      event = JSON.parse(eventData);
    } catch {
    }
  }
  return {
    eventName: process.env.GITHUB_EVENT_NAME || "",
    repository: process.env.GITHUB_REPOSITORY || "",
    ref: process.env.GITHUB_REF || "",
    sha: process.env.GITHUB_SHA || "",
    actor: process.env.GITHUB_ACTOR || "",
    workflow: process.env.GITHUB_WORKFLOW || "",
    defaultBranch: event.repository?.default_branch || "main",
    baseRef: event.pull_request?.base?.ref || "main",
    prNumber: event.pull_request?.number
  };
}
async function analyzeRepo(rootDir, config) {
  const files = await findSourceFiles(rootDir, config.ignore || []);
  const allImports = [];
  const allFiles = [];
  for (const file of files) {
    const fullPath = path.join(rootDir, file);
    const content = await fs.readFile(fullPath, "utf-8");
    let imports;
    if (file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".js") || file.endsWith(".jsx")) {
      imports = await extractTypeScriptImports(file, content);
    } else if (file.endsWith(".py")) {
      imports = await extractPythonImports(file, content);
    } else {
      continue;
    }
    allImports.push(imports);
    allFiles.push(file);
  }
  const tsconfig = await loadTsConfig(rootDir);
  const workspaces = await findWorkspaces(rootDir);
  const resolved = await resolveImports(allImports, {
    rootDir,
    tsconfig: tsconfig || void 0,
    workspaces: workspaces.length > 0 ? workspaces : void 0
  });
  const moduleConfig = config.modules || {};
  const graph = buildGraph(resolved, allFiles, moduleConfig);
  return graph;
}
async function findSourceFiles(rootDir, ignore) {
  const files = [];
  const ignorePatterns = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**",
    "**/coverage/**",
    "**/*.test.*",
    "**/*.spec.*",
    "**/__tests__/**",
    ...ignore
  ];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(rootDir, fullPath);
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        if (isSourceFile(entry.name)) {
          files.push(relativePath);
        }
      }
    }
  }
  await walk(rootDir);
  return files;
}
function shouldIgnore(filePath, patterns) {
  const normalized = filePath.replace(/\\/g, "/");
  for (const pattern of patterns) {
    const regex = patternToRegex(pattern);
    if (regex.test(normalized)) {
      return true;
    }
  }
  return false;
}
function patternToRegex(pattern) {
  const regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "___DOUBLESTAR___").replace(/\*/g, "[^/]*").replace(/___DOUBLESTAR___/g, ".*");
  return new RegExp(`^${regexStr}$`);
}
function isSourceFile(name) {
  return /\.(ts|tsx|js|jsx|py)$/.test(name);
}
async function loadConfig(rootDir) {
  const configPath = path.join(rootDir, "archmap.yml");
  let config = {};
  try {
    const content = await fs.readFile(configPath, "utf-8");
    const yaml = await import("js-yaml");
    config = yaml.load(content);
  } catch {
    config = {};
  }
  const inputMode = process.env.INPUT_MODE;
  if (inputMode === "comment" || inputMode === "gate") {
    config.mode = inputMode;
  }
  return config;
}
runAction().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
//# sourceMappingURL=action.js.map