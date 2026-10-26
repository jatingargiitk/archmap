import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { FileImports, ResolvedImport } from '../types.js';

export interface ResolverConfig {
  rootDir: string;
  tsconfig?: TsConfigPaths;
  workspaces?: string[];
}

export interface TsConfigPaths {
  baseUrl?: string;
  paths?: Record<string, string[]>;
}

export async function resolveImports(
  fileImports: FileImports[],
  config: ResolverConfig
): Promise<ResolvedImport[]> {
  const resolved: ResolvedImport[] = [];

  for (const { file, imports } of fileImports) {
    for (const imp of imports) {
      const resolvedPath = await resolveImport(imp.from, file, config);
      if (resolvedPath) {
        resolved.push({
          from: file,
          to: resolvedPath,
          location: imp.location,
        });
      }
    }
  }

  return resolved;
}

async function resolveImport(
  importPath: string,
  fromFile: string,
  config: ResolverConfig
): Promise<string | null> {
  if (isExternalModule(importPath)) {
    return null;
  }

  const fileExt = path.extname(fromFile);
  const isPython = fileExt === '.py';

  if (isPython) {
    return resolvePythonImport(importPath, fromFile, config);
  }

  return resolveTypeScriptImport(importPath, fromFile, config);
}

function isExternalModule(importPath: string): boolean {
  return !importPath.startsWith('.') && !importPath.startsWith('/');
}

async function resolveTypeScriptImport(
  importPath: string,
  fromFile: string,
  config: ResolverConfig
): Promise<string | null> {
  if (importPath.startsWith('.')) {
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

async function resolveRelativePath(
  importPath: string,
  fromFile: string,
  config: ResolverConfig
): Promise<string | null> {
  const dir = path.dirname(fromFile);
  let candidatePath = path.join(dir, importPath);

  // Handle ESM-style TypeScript imports: map .js/.mjs/.cjs to their TS sources (B3)
  const esmExt = path.extname(candidatePath);
  if (esmExt === '.js' || esmExt === '.mjs' || esmExt === '.cjs') {
    const basePath = candidatePath.slice(0, -esmExt.length);
    
    // Map .js -> .ts/.tsx, .mjs -> .mts, .cjs -> .cts
    const tsExtensions = esmExt === '.mjs' ? ['.mts'] :
                         esmExt === '.cjs' ? ['.cts'] :
                         ['.ts', '.tsx'];
    
    for (const tsExt of tsExtensions) {
      const tsPath = basePath + tsExt;
      if (await fileExists(path.join(config.rootDir, tsPath))) {
        return tsPath;
      }
    }
    
    // If no TS source found, continue with normal resolution
    candidatePath = basePath;
  }

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
  
  for (const ext of extensions) {
    const withExt = candidatePath + ext;
    if (await fileExists(path.join(config.rootDir, withExt))) {
      return withExt;
    }
  }

  for (const ext of ['index.ts', 'index.tsx', 'index.js', 'index.jsx']) {
    const indexPath = path.join(candidatePath, ext);
    if (await fileExists(path.join(config.rootDir, indexPath))) {
      return indexPath;
    }
  }

  return null;
}

async function resolvePathAlias(
  importPath: string,
  config: ResolverConfig
): Promise<string | null> {
  if (!config.tsconfig?.paths) return null;

  const { paths, baseUrl = '.' } = config.tsconfig;

  for (const [pattern, mappings] of Object.entries(paths)) {
    const regex = patternToRegex(pattern);
    const match = importPath.match(regex);

    if (match) {
      for (const mapping of mappings) {
        const resolved = mapping.replace('*', match[1] || '');
        const fullPath = path.join(baseUrl, resolved);
        
        const candidate = await resolveRelativePath(`./${fullPath}`, '', {
          ...config,
          rootDir: config.rootDir,
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

async function resolveWorkspace(
  importPath: string,
  config: ResolverConfig
): Promise<string | null> {
  if (!config.workspaces) return null;

  for (const workspace of config.workspaces) {
    const packageJsonPath = path.join(config.rootDir, workspace, 'package.json');
    
    try {
      const content = await fs.readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);
      
      if (pkg.name === importPath || importPath.startsWith(pkg.name + '/')) {
        const subpath = importPath.slice(pkg.name.length + 1) || '.';
        const mainFile = pkg.main || pkg.module || 'index.js';
        
        if (subpath === '.') {
          return path.join(workspace, mainFile);
        }
        
        const resolved = await resolveRelativePath(`./${subpath}`, workspace, {
          ...config,
          rootDir: config.rootDir,
        });
        
        if (resolved) return resolved;
      }
    } catch {
      // Skip if package.json doesn't exist
    }
  }

  return null;
}

async function resolvePythonImport(
  importPath: string,
  fromFile: string,
  config: ResolverConfig
): Promise<string | null> {
  if (importPath.startsWith('.')) {
    return resolvePythonRelative(importPath, fromFile, config);
  }

  const parts = importPath.split('.');
  const possiblePaths = [
    path.join(...parts) + '.py',
    path.join(...parts, '__init__.py'),
    path.join('src', ...parts) + '.py',
    path.join('src', ...parts, '__init__.py'),
  ];

  for (const possiblePath of possiblePaths) {
    if (await fileExists(path.join(config.rootDir, possiblePath))) {
      return possiblePath;
    }
  }

  return null;
}

async function resolvePythonRelative(
  importPath: string,
  fromFile: string,
  config: ResolverConfig
): Promise<string | null> {
  const dir = path.dirname(fromFile);
  let targetDir = dir;

  const dots = importPath.match(/^\.+/)?.[0] || '.';
  const rest = importPath.slice(dots.length);

  for (let i = 1; i < dots.length; i++) {
    targetDir = path.dirname(targetDir);
  }

  if (rest) {
    const parts = rest.split('.');
    targetDir = path.join(targetDir, ...parts);
  }

  const candidatePath = targetDir + '.py';
  if (await fileExists(path.join(config.rootDir, candidatePath))) {
    return candidatePath;
  }

  const initPath = path.join(targetDir, '__init__.py');
  if (await fileExists(path.join(config.rootDir, initPath))) {
    return initPath;
  }

  return null;
}

function patternToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const withWildcard = escaped.replace(/\\\*/g, '(.*)');
  return new RegExp(`^${withWildcard}$`);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function loadTsConfig(rootDir: string): Promise<TsConfigPaths | null> {
  const tsconfigPath = path.join(rootDir, 'tsconfig.json');
  
  try {
    const content = await fs.readFile(tsconfigPath, 'utf-8');
    const tsconfig = JSON.parse(content);
    
    return {
      baseUrl: tsconfig.compilerOptions?.baseUrl,
      paths: tsconfig.compilerOptions?.paths,
    };
  } catch {
    return null;
  }
}

export async function findWorkspaces(rootDir: string): Promise<string[]> {
  const packageJsonPath = path.join(rootDir, 'package.json');
  
  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    
    if (pkg.workspaces) {
      const patterns = Array.isArray(pkg.workspaces) 
        ? pkg.workspaces 
        : pkg.workspaces.packages || [];
      
      const workspaces: string[] = [];
      for (const pattern of patterns) {
        if (!pattern.includes('*')) {
          workspaces.push(pattern);
        } else {
          const base = pattern.replace('/*', '');
          try {
            const entries = await fs.readdir(path.join(rootDir, base));
            for (const entry of entries) {
              const fullPath = path.join(base, entry);
              const pkgPath = path.join(rootDir, fullPath, 'package.json');
              if (await fileExists(pkgPath)) {
                workspaces.push(fullPath);
              }
            }
          } catch {
            // Skip if base doesn't exist
          }
        }
      }
      
      return workspaces;
    }
  } catch {
    // No package.json or not a workspace
  }
  
  return [];
}
