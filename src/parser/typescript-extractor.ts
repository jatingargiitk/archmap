import type { Node } from 'web-tree-sitter';
import type { Import, FileImports, Location } from '../types.js';
import { parseFile } from './tree-sitter-loader.js';

export async function extractTypeScriptImports(filePath: string, content: string): Promise<FileImports> {
  const tree = await parseFile(content, 'typescript');
  const imports: Import[] = [];

  visitNode(tree.rootNode, (node) => {
    if (node.type === 'import_statement') {
      const imp = extractImportStatement(node, filePath, content);
      if (imp) imports.push(imp);
    } else if (node.type === 'call_expression') {
      const imp = extractDynamicImport(node, filePath, content);
      if (imp) imports.push(imp);
    }
  });

  return { file: filePath, imports };
}

function extractImportStatement(node: Node, file: string, content: string): Import | null {
  const sourceNode = node.childForFieldName('source');
  if (!sourceNode) return null;

  const from = extractStringValue(sourceNode, content);
  if (!from) return null;

  return {
    from,
    location: getLocation(node, file),
  };
}

function extractDynamicImport(node: Node, file: string, content: string): Import | null {
  const func = node.childForFieldName('function');
  if (!func || func.text !== 'import') return null;

  const args = node.childForFieldName('arguments');
  if (!args) return null;

  const firstArg = args.children.find((c: Node) => c.type === 'string' || c.type === 'template_string');
  if (!firstArg) return null;

  const from = extractStringValue(firstArg, content);
  if (!from) return null;

  return {
    from,
    isDynamic: true,
    location: getLocation(node, file),
  };
}

function extractStringValue(node: Node, content: string): string | null {
  const text = node.text;
  if (text.startsWith('"') || text.startsWith("'")) {
    return text.slice(1, -1);
  }
  if (text.startsWith('`')) {
    const withoutBackticks = text.slice(1, -1);
    if (!withoutBackticks.includes('${')) {
      return withoutBackticks;
    }
  }
  return null;
}

function getLocation(node: Node, file: string): Location {
  return {
    file,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  };
}

function visitNode(node: Node, visitor: (node: Node) => void): void {
  visitor(node);
  for (const child of node.children) {
    visitNode(child, visitor);
  }
}

export async function extractJavaScriptImports(filePath: string, content: string): Promise<FileImports> {
  return extractTypeScriptImports(filePath, content);
}
