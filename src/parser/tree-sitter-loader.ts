import Parser from 'web-tree-sitter';

let parserInitialized = false;

export async function initParser(): Promise<void> {
  if (parserInitialized) return;
  await Parser.init();
  parserInitialized = true;
}

const languageCache = new Map<string, Parser.Language>();

export async function loadLanguage(name: 'typescript' | 'python'): Promise<Parser.Language> {
  if (languageCache.has(name)) {
    return languageCache.get(name)!;
  }

  await initParser();
  
  const wasmPath = await getWasmPath(name);
  const language = await Parser.Language.load(wasmPath);
  languageCache.set(name, language);
  
  return language;
}

async function getWasmPath(name: string): Promise<string> {
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve(`tree-sitter-${name}/tree-sitter-${name}.wasm`);
    return wasmPath;
  } catch {
    return `node_modules/tree-sitter-${name}/tree-sitter-${name}.wasm`;
  }
}

export async function parseFile(content: string, language: 'typescript' | 'python'): Promise<Parser.Tree> {
  const lang = await loadLanguage(language);
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser.parse(content);
}
