import { test, expect } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PAGE_ROUTES, writeResultArtifact } from '../fixtures/scenarios';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

function selectorOf(target: unknown): string {
  if (Array.isArray(target)) return target.map(String).join(' ');
  return String(target ?? '');
}

/**
 * Accessibility matrix: axe-core with the WCAG 2.1 A + AA rule sets on every
 * route. Only `critical` and `serious` violations fail the build; every
 * violation is printed with its rule id, impact and offending selector so the
 * report is actionable.
 */
for (const route of PAGE_ROUTES) {
  test(`a11y ${route.path} has no critical/serious violations`, async ({ page }) => {
    await page.goto(route.path, { waitUntil: 'networkidle' });
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForTimeout(250);

    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

    const violations = results.violations.map((violation) => ({
      route: route.path,
      id: violation.id,
      impact: violation.impact ?? 'unknown',
      help: violation.help,
      helpUrl: violation.helpUrl,
      nodes: violation.nodes.map((node) => ({
        target: selectorOf(node.target),
        html: node.html,
        failureSummary: node.failureSummary ?? '',
      })),
    }));

    writeResultArtifact('axe-violations.json', route.path, violations);

    if (violations.length > 0) {
      const lines = violations.map((violation) => {
        const selectors = violation.nodes
          .map((node) => node.target)
          .filter(Boolean)
          .slice(0, 5)
          .join(' | ');
        return `  - ${violation.id} [${violation.impact}] ${violation.help}\n    selector(s): ${selectors || '(none)'}`;
      });
      console.log(`\n[axe] ${route.path} — ${violations.length} violation(s)\n${lines.join('\n')}`);
    }

    const blocking = violations.filter((violation) => BLOCKING_IMPACTS.has(violation.impact));
    const detail = blocking
      .map((violation) => {
        const selectors = violation.nodes
          .map((node) => node.target)
          .filter(Boolean)
          .slice(0, 5)
          .join(' | ');
        return `${violation.id} [${violation.impact}] ${violation.help} :: ${selectors || '(no selector)'}`;
      })
      .join('\n');

    expect(
      blocking,
      `axe critical/serious violations on ${route.path}:\n${detail}`,
    ).toEqual([]);
  });
}
