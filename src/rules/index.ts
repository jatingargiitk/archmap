import type { Config, ModuleEdge, GraphDiff } from '../types.js';

export interface RuleViolation {
  rule: string;
  edge: ModuleEdge;
  message: string;
}

export function checkRules(
  edges: ModuleEdge[],
  config: Config
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (!config.rules) {
    return violations;
  }

  for (const rule of config.rules) {
    if (rule.deny) {
      const ruleViolations = checkDenyRule(edges, rule.deny);
      violations.push(...ruleViolations);
    }
  }

  return violations;
}

function checkDenyRule(
  edges: ModuleEdge[],
  deny: { from: string; to: string }
): RuleViolation[] {
  const violations: RuleViolation[] = [];

  for (const edge of edges) {
    if (matchesPattern(edge.from, deny.from) && matchesPattern(edge.to, deny.to)) {
      violations.push({
        rule: `deny: ${deny.from} → ${deny.to}`,
        edge,
        message: `Module ${edge.from} is not allowed to depend on ${edge.to}`,
      });
    }
  }

  return violations;
}

function matchesPattern(modulePath: string, pattern: string): boolean {
  // If pattern ends with /**, it should match the directory itself and anything under it
  // e.g., "ui/**" should match "src/ui", "ui", "foo/ui", and "src/ui/components"
  if (pattern.endsWith('/**')) {
    const basePattern = pattern.slice(0, -3); // Remove the /**
    const regex = patternToRegex(basePattern);
    
    // Match if the module path ends with the pattern (e.g., "src/ui" ends with "ui")
    // or contains the pattern as a segment (e.g., "src/ui/button" contains "ui")
    if (regex.test(modulePath) || regex.test(modulePath + '/')) {
      return true;
    }
    
    // Also check if the module path ends with the base pattern
    const parts = modulePath.split('/');
    for (let i = 0; i < parts.length; i++) {
      const segment = parts.slice(i).join('/');
      if (regex.test(segment) || regex.test(segment + '/')) {
        return true;
      }
    }
  }
  
  // Standard glob matching
  const regex = patternToRegex(pattern);
  return regex.test(modulePath) || regex.test(modulePath + '/');
}

function patternToRegex(pattern: string): RegExp {
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLESTAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLESTAR___/g, '.*');

  return new RegExp(`^${regexStr}$`);
}

export function shouldFailCheck(
  diff: GraphDiff,
  violations: RuleViolation[],
  config: Config
): boolean {
  if (config.mode === 'gate') {
    if (diff.added.length > 0 || diff.removed.length > 0) {
      return true;
    }
  }

  return violations.length > 0;
}
