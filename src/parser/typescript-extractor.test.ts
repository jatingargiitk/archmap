import { describe, it, expect } from 'vitest';
import { extractTypeScriptImports } from './typescript-extractor.js';

describe('extractTypeScriptImports', () => {
  it('should extract ES6 imports', async () => {
    const code = `
import { foo } from './foo';
import bar from '../bar';
import * as baz from 'baz';
    `;

    const result = await extractTypeScriptImports('test.ts', code);
    
    expect(result.imports).toHaveLength(3);
    expect(result.imports[0].from).toBe('./foo');
    expect(result.imports[1].from).toBe('../bar');
    expect(result.imports[2].from).toBe('baz');
  });

  it('should extract require calls in TypeScript', async () => {
    const code = `
const foo = require('./foo');
const { bar } = require('../bar');
    `;

    const result = await extractTypeScriptImports('test.ts', code);
    
    expect(result.imports).toHaveLength(0);
  });

  it('should extract dynamic imports', async () => {
    const code = `
const module = await import('./module');
import('./another').then(m => m.default);
    `;

    const result = await extractTypeScriptImports('test.ts', code);
    
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].from).toBe('./module');
    expect(result.imports[0].isDynamic).toBe(true);
    expect(result.imports[1].from).toBe('./another');
    expect(result.imports[1].isDynamic).toBe(true);
  });

  it('should track import locations', async () => {
    const code = `import { foo } from './foo';\nimport bar from './bar';`;

    const result = await extractTypeScriptImports('test.ts', code);
    
    expect(result.imports[0].location.line).toBe(1);
    expect(result.imports[1].location.line).toBe(2);
    expect(result.imports[0].location.file).toBe('test.ts');
  });

  it('should handle mixed quotes', async () => {
    const code = `
import foo from "./foo";
import bar from '../bar';
    `;

    const result = await extractTypeScriptImports('test.ts', code);
    
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].from).toBe('./foo');
    expect(result.imports[1].from).toBe('../bar');
  });

  it('should ignore template strings with interpolation', async () => {
    const code = `
import foo from \`./\${name}\`;
    `;

    const result = await extractTypeScriptImports('test.ts', code);
    
    expect(result.imports).toHaveLength(0);
  });
});
