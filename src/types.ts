export interface Import {
  from: string;
  importedNames?: string[];
  isDefault?: boolean;
  isDynamic?: boolean;
  location: Location;
}

export interface Location {
  file: string;
  line: number;
  column: number;
}

export interface FileImports {
  file: string;
  imports: Import[];
}

export interface ResolvedImport {
  from: string;
  to: string;
  location: Location;
}

export interface Module {
  name: string;
  files: string[];
  fanIn: number;
  fanOut: number;
  externalDeps: string[];
}

export interface ModuleEdge {
  from: string;
  to: string;
  weight: number;
  locations: Location[];
}

export interface Graph {
  modules: Module[];
  edges: ModuleEdge[];
  cycles: string[][];
}

export interface LockFile {
  version: string;
  modules: string[];
  edges: Array<{ from: string; to: string; weight: number }>;
  externalDeps: Record<string, string[]>;
}

export interface GraphDiff {
  added: ModuleEdge[];
  removed: ModuleEdge[];
  newCycles: string[][];
}

export interface Config {
  modules?: {
    roots?: string[];
    depth?: number;
  };
  ignore?: string[];
  rules?: Array<{
    deny?: { from: string; to: string };
  }>;
  mode?: 'comment' | 'gate';
  explain?: boolean;
}
