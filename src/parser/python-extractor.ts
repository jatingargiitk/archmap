import type { FileImports } from '../types.js';

export async function extractPythonImports(filePath: string, content: string): Promise<FileImports> {
  return { file: filePath, imports: [] };
}
