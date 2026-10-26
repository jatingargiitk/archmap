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

  const fromPattern = patternToRegex(deny.from);
  const toPattern = patternToRegex(deny.to);

  for (const edge of edges) {
    if (fromPattern.test(edge.from) && toPattern.test(edge.to)) {
      violations.push({
        rule: `deny: ${deny.from} → ${deny.to}`,
        edge,
        message: `Module ${edge.from} is not allowed to depend on ${edge.to}`,
      });
    }
  }

  return violations;
}

function patternToRegex(pattern: string): RegExp {
  let regexStr = pattern
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
