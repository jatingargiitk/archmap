import type { SyntaxNode } from 'web-tree-sitter';
import type { Import, FileImports, Location } from '../types.js';
import { parseFile } from './tree-sitter-loader.js';

export async function extractPythonImports(filePath: string, content: string): Promise<FileImports> {
  const tree = await parseFile(content, 'python');
  const imports: Import[] = [];

  visitNode(tree.rootNode, (node) => {
    if (node.type === 'import_statement' || node.type === 'import_from_statement') {
      const imp = extractImport(node, filePath, content);
      if (imp) imports.push(imp);
    }
  });

  return { file: filePath, imports };
}

function extractImport(node: SyntaxNode, file: string, content: string): Import | null {
  if (node.type === 'import_statement') {
    return extractPlainImport(node, file);
  } else if (node.type === 'import_from_statement') {
    return extractFromImport(node, file);
  }
  return null;
}

function extractPlainImport(node: SyntaxNode, file: string): Import | null {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return null;

  const moduleName = getModuleName(nameNode);
  if (!moduleName) return null;

  return {
    from: moduleName,
    location: getLocation(node, file),
  };
}

function extractFromImport(node: SyntaxNode, file: string): Import | null {
  const moduleNode = node.childForFieldName('module_name');
  if (!moduleNode) return null;

  const moduleName = getModuleName(moduleNode);
  if (!moduleName) return null;

  return {
    from: moduleName,
    location: getLocation(node, file),
  };
}

function getModuleName(node: SyntaxNode): string | null {
  if (node.type === 'dotted_name') {
    return node.text;
  } else if (node.type === 'relative_import') {
    return node.text;
  } else if (node.type === 'aliased_import') {
    const nameChild = node.childForFieldName('name');
    if (nameChild) {
      return getModuleName(nameChild);
    }
  }
  return node.text || null;
}

function getLocation(node: SyntaxNode, file: string): Location {
  return {
    file,
    line: node.startPosition.row + 1,
    column: node.startPosition.column,
  };
}

function visitNode(node: SyntaxNode, visitor: (node: SyntaxNode) => void): void {
  visitor(node);
  for (const child of node.children) {
    visitNode(child, visitor);
  }
}
