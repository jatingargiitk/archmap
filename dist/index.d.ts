interface Import {
    from: string;
    importedNames?: string[];
    isDefault?: boolean;
    isDynamic?: boolean;
    location: Location;
}
interface Location {
    file: string;
    line: number;
    column: number;
}
interface FileImports {
    file: string;
    imports: Import[];
}
interface ResolvedImport {
    from: string;
    to: string;
    location: Location;
}
interface Module {
    name: string;
    files: string[];
    fanIn: number;
    fanOut: number;
    externalDeps: string[];
}
interface ModuleEdge {
    from: string;
    to: string;
    weight: number;
    locations: Location[];
}
interface Graph {
    modules: Module[];
    edges: ModuleEdge[];
    cycles: string[][];
}
interface LockFile {
    version: string;
    modules: string[];
    edges: Array<{
        from: string;
        to: string;
        weight: number;
    }>;
    externalDeps: Record<string, string[]>;
}
interface GraphDiff {
    added: ModuleEdge[];
    removed: ModuleEdge[];
    newCycles: string[][];
}
interface Config {
    modules?: {
        roots?: string[];
        depth?: number;
    };
    ignore?: string[];
    rules?: Array<{
        deny?: {
            from: string;
            to: string;
        };
    }>;
    mode?: 'comment' | 'gate';
    explain?: boolean;
}

declare function extractTypeScriptImports(filePath: string, content: string): Promise<FileImports>;
declare function extractJavaScriptImports(filePath: string, content: string): Promise<FileImports>;

declare function extractPythonImports(filePath: string, content: string): Promise<FileImports>;

declare function initParser(): Promise<void>;

interface ResolverConfig {
    rootDir: string;
    tsconfig?: TsConfigPaths;
    workspaces?: string[];
}
interface TsConfigPaths {
    baseUrl?: string;
    paths?: Record<string, string[]>;
}
declare function resolveImports(fileImports: FileImports[], config: ResolverConfig): Promise<ResolvedImport[]>;
declare function loadTsConfig(rootDir: string): Promise<TsConfigPaths | null>;
declare function findWorkspaces(rootDir: string): Promise<string[]>;

interface ModuleConfig {
    roots?: string[];
    depth?: number;
}
declare function buildGraph(resolvedImports: ResolvedImport[], allFiles: string[], config?: ModuleConfig): Graph;
declare function detectCycles(edges: ModuleEdge[], modules: string[]): string[][];
declare function computeLOC(files: Map<string, string>): Map<string, number>;

declare function renderMermaid(graph: Graph): string;
declare function writeArchitectureFile(filePath: string, graph: Graph): Promise<void>;
declare function renderDeltaDiagram(addedEdges: ModuleEdge[], removedEdges: ModuleEdge[], touchedModules: Set<string>): string;

declare function graphToLock(graph: Graph): LockFile;
declare function writeLockFile(filePath: string, lock: LockFile): Promise<void>;
declare function readLockFile(filePath: string): Promise<LockFile | null>;
declare function diffLocks(oldLock: LockFile | null, newLock: LockFile, newGraph?: Graph): GraphDiff;

declare const version = "0.1.0";

export { type Config, type FileImports, type Graph, type GraphDiff, type Import, type Location, type LockFile, type Module, type ModuleConfig, type ModuleEdge, type ResolvedImport, type ResolverConfig, type TsConfigPaths, buildGraph, computeLOC, detectCycles, diffLocks, extractJavaScriptImports, extractPythonImports, extractTypeScriptImports, findWorkspaces, graphToLock, initParser, loadTsConfig, readLockFile, renderDeltaDiagram, renderMermaid, resolveImports, version, writeArchitectureFile, writeLockFile };
