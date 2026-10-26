import { describe, it, expect } from 'vitest';
import { extractPythonImports } from './python-extractor.js';

describe('extractPythonImports', () => {
  it('should extract plain imports', async () => {
    const code = `
import os
import sys
import json
    `;

    const result = await extractPythonImports('test.py', code);
    
    expect(result.imports).toHaveLength(3);
    expect(result.imports[0].from).toBe('os');
    expect(result.imports[1].from).toBe('sys');
    expect(result.imports[2].from).toBe('json');
  });

  it('should extract from imports', async () => {
    const code = `
from pathlib import Path
from typing import List, Dict
from . import utils
from .. import config
    `;

    const result = await extractPythonImports('test.py', code);
    
    expect(result.imports).toHaveLength(4);
    expect(result.imports[0].from).toBe('pathlib');
    expect(result.imports[1].from).toBe('typing');
    expect(result.imports[2].from).toBe('.');
    expect(result.imports[3].from).toBe('..');
  });

  it('should extract dotted imports', async () => {
    const code = `
import os.path
from collections.abc import Mapping
    `;

    const result = await extractPythonImports('test.py', code);
    
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].from).toBe('os.path');
    expect(result.imports[1].from).toBe('collections.abc');
  });

  it('should track import locations', async () => {
    const code = `import os\nfrom pathlib import Path`;

    const result = await extractPythonImports('test.py', code);
    
    expect(result.imports[0].location.line).toBe(1);
    expect(result.imports[1].location.line).toBe(2);
    expect(result.imports[0].location.file).toBe('test.py');
  });

  it('should handle relative imports with dots', async () => {
    const code = `
from . import sibling
from .. import parent
from ...package import module
    `;

    const result = await extractPythonImports('test.py', code);
    
    expect(result.imports).toHaveLength(3);
    expect(result.imports[0].from).toBe('.');
    expect(result.imports[1].from).toBe('..');
    expect(result.imports[2].from).toBe('...package');
  });

  it('should handle import as', async () => {
    const code = `
import numpy as np
from typing import List as L
    `;

    const result = await extractPythonImports('test.py', code);
    
    expect(result.imports).toHaveLength(2);
    expect(result.imports[0].from).toBe('numpy');
    expect(result.imports[1].from).toBe('typing');
  });
});
