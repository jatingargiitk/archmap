import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

const testDir = path.join(process.cwd(), '.test-cli');
const cliPath = path.join(process.cwd(), 'dist/cli.js');

async function setup() {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  
  // Create a simple project
  await fs.mkdir(path.join(testDir, 'src/ui'), { recursive: true });
  await fs.mkdir(path.join(testDir, 'src/db'), { recursive: true });
  
  await fs.writeFile(
    path.join(testDir, 'src/ui/Button.ts'),
    'export const Button = () => "button";'
  );
  
  await fs.writeFile(
    path.join(testDir, 'src/db/users.ts'),
    'export const getUser = () => ({});'
  );
}

describe('CLI check command', () => {
  beforeEach(async () => {
    await setup();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it('should fail when there are unapproved edges (B1 regression)', async () => {
    // Create baseline
    execSync(`node ${cliPath} render`, { cwd: testDir });
    
    // Add a cross-module import
    await fs.writeFile(
      path.join(testDir, 'src/ui/Button.ts'),
      `import { getUser } from '../db/users';\nexport const Button = () => getUser();`
    );
    
    // Check should fail with exit code 1
    expect(() => {
      execSync(`node ${cliPath} check`, { cwd: testDir, stdio: 'pipe' });
    }).toThrow();
    
    const result = execSync(`node ${cliPath} check 2>&1 || true`, { 
      cwd: testDir, 
      encoding: 'utf-8' 
    });
    
    expect(result).toContain('❌ Unapproved changes detected');
    expect(result).toContain('+1 new edge');
  });

  it('should pass after accepting changes', async () => {
    // Create baseline
    execSync(`node ${cliPath} render`, { cwd: testDir });
    
    // Add a cross-module import
    await fs.writeFile(
      path.join(testDir, 'src/ui/Button.ts'),
      `import { getUser } from '../db/users';\nexport const Button = () => getUser();`
    );
    
    // Accept the changes
    execSync(`node ${cliPath} accept`, { cwd: testDir });
    
    // Check should now pass
    const result = execSync(`node ${cliPath} check`, { 
      cwd: testDir, 
      encoding: 'utf-8' 
    });
    
    expect(result).toContain('✅ No unapproved changes');
  });

  it('should generate workflow that uses the GitHub Action', async () => {
    // Run init
    execSync(`node ${cliPath} init`, { cwd: testDir });
    
    // Verify workflow file was created
    const workflowPath = path.join(testDir, '.github/workflows/archmap.yml');
    const workflowContent = await fs.readFile(workflowPath, 'utf-8');
    
    // Assert workflow uses the Action, not CLI commands
    expect(workflowContent).toContain('uses: jatingargiitk/archmap@v0');
    expect(workflowContent).toContain('on:');
    expect(workflowContent).toContain('pull_request:');
    expect(workflowContent).toContain('permissions:');
    expect(workflowContent).toContain('contents: write');
    expect(workflowContent).toContain('pull-requests: write');
    
    // Must NOT contain the buggy npx commands
    expect(workflowContent).not.toContain('npx @jatingargiitk/archmap render');
    expect(workflowContent).not.toContain('npx @jatingargiitk/archmap check');
    expect(workflowContent).not.toContain('|| true');
  });
});
