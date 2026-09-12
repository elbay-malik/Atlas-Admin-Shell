/**
 * What this project is willing to promise about performance.
 *
 * Two principles behind these numbers:
 *
 * 1. They must be demanding enough to catch a regression, but not so tight that
 *    the only way to pass is to abandon runtime federation. Composing three
 *    independently deployed remotes over import maps has a real cost, chosen
 *    deliberately in ADR-0004. A budget that forbids it would be a budget
 *    against the architecture rather than against regressions.
 * 2. Anything asserted must actually be measurable here. See INP below.
 */

/** Assertions that fail the build: deterministic, and about our own code. */
export const ERRORS = {
  'cumulative-layout-shift': { max: 0.1, label: 'Cumulative Layout Shift' },
  'errors-in-console': { minScore: 1, label: 'No console errors' },
};

/**
 * Real signal, but noisy on a shared CI runner, so these report rather than
 * fail. Promoting them is a decision to make once the numbers have a track
 * record — not on day one, when a flaky red build teaches people to ignore it.
 */
export const WARNINGS = {
  'first-contentful-paint': { max: 2000, label: 'First Contentful Paint' },
  'largest-contentful-paint': { max: 2500, label: 'Largest Contentful Paint' },
  'total-blocking-time': { max: 350, label: 'Total Blocking Time' },
  'speed-index': { max: 3000, label: 'Speed Index' },
};

/** Category scores, 0..1. */
export const CATEGORIES = {
  performance: { minScore: 0.7, level: 'warn' },
  'best-practices': { minScore: 0.9, level: 'warn' },
  // Accessibility is deliberately NOT gated here. axe already gates it twice —
  // every Storybook story in both themes, and the whole console through the
  // Playwright suite — over more pages and more states than Lighthouse sees. A
  // third, weaker check would add noise rather than safety.
};

/**
 * Deliberately absent: interaction-to-next-paint.
 *
 * INP is a field metric. In a Lighthouse navigation run the audit is not in the
 * report at all (it declares supportedModes: ['timespan']) and it carries zero
 * weight in the performance score. Asserting a minimum score would pass
 * silently forever; asserting a numeric value would fail with "did not produce
 * a value". Either way it would be a gate that measures nothing, so the honest
 * position is that Total Blocking Time is the lab proxy and real INP needs
 * field data.
 */
export const NOT_MEASURABLE_IN_LAB = ['interaction-to-next-paint'];

/**
 * The routes worth measuring.
 *
 * '/' is the shell alone: cheap, stable, the pure boot cost. '/flags' is the
 * number that actually reflects ADR-0004, because reaching it forces the
 * manifest, three cross-origin remoteEntry fetches, and then a remote's own
 * chunks before anything domain-shaped paints.
 */
export const ROUTES = [
  { path: '/', name: 'shell (signed out)', persona: null, ready: 'shell-overview' },
  {
    path: '/flags',
    name: 'feature flags (federated, signed in)',
    persona: 'viewer',
    ready: 'flags-home',
  },
];
