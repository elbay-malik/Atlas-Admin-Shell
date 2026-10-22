---
target: the Atlas Admin console
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:/Users/elbaymalik/dev/eleo/atlas_admin_shell/apps/shell/src/app/layout/shell-layout.ts"
target_fingerprint: "sha256:8c994822eba3396044933ed1c6606f5a2ac4cd3b80bb637ab9cc6166f69dacef"
target_path: /Users/elbaymalik/dev/eleo/atlas_admin_shell/apps/shell/src/app/layout/shell-layout.ts
timestamp: 2026-10-22T14-12-18Z
slug: apps-shell-src-app-layout-shell-layout-ts
---
Method: dual-agent (A: design review · B: detector + browser evidence), isolated and parallel.
Target: apps/shell/src/app/layout/shell-layout.ts — scope the composed console. Mode: Operate.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Error boundary exemplary; no live regions on any domain screen, no aria-current, `<title>` is `shell` on every route, "0 live" above four rows |
| 2 | Match System / Real World | 3 | Vocabulary right; two copy claims unhonoured ("per environment" with no control, "live from every domain" over static fixtures) |
| 3 | User Control and Freedom | 1 | No undo. Viewer deep-linking /iam silently redirected. Admin can deactivate own session and self-demote |
| 4 | Consistency and Standards | 3 | Strong where authored; IAM role `<select>` unstyled native at 29px, filter uses `rounded` against the One Radius Rule |
| 5 | Error Prevention | 1 | Zero confirmation on both destructive actions. sso-enforced flips on one 45x30 click. No self-demotion or last-admin guard |
| 6 | Recognition Rather Than Recall | 3 | Active tint, role pill, ISO timestamps. No aria-current; On/Off conflates report with command |
| 7 | Flexibility and Efficiency | 1 | No shortcuts, bulk select, column sort; audit filter not in URL so refresh loses it |
| 8 | Aesthetic and Minimalist | 2 | Restraint real, but Overview is two sentences over ~750px of empty slate, identical signed out / admin / viewer |
| 9 | Error Recovery | 4 | Excellent. Attempts, failure class, literal error in mono, role=status countdown, nav keeps href |
| 10 | Help and Documentation | 1 | No in-app help, no admin/viewer explanation, no link to README or 13 ADRs; the one hint is false when signed out |
| **Total** | | **21/40** | **Acceptable** (bottom of band) |

No heuristic n/a; Operate surface, all ten apply.

## Design Specificity Verdict

The design SYSTEM is authored for this product. The screens an evaluator meets are not.

DESIGN.md's reasoning is genuinely specific and holds up under measurement. But the composition is a stock admin frame: 240px rail, wordmark top-left, identity + role pill top-right, h1 + muted subtitle + right-aligned pills, table below. Swap the word "Atlas" and four emoji and it is an unmodified Tailwind admin starter.

The one thing only true of this product — four independently deployed origins composed at runtime — is visible nowhere on a healthy screen. It is visible exactly once, when a remote fails. PRODUCT.md Principle 1 is "Architecture must be visible, not just claimed"; the happy path claims it in one sentence and shows it never.

The emoji are the only expressive gesture and the weakest element: four full-colour OS glyphs beside a thin geometric one, and the only place colour arrives without carrying state — breaking the system's own Rationed Colour Rule in its most visible component.

### Deterministic scan: 1 finding across 16 scans; the near-silence was the finding

- 8 URL scans (1280x800, 390x844) all hit the SIGNED-OUT shell: `detect <url>` cannot seed localStorage, so every protected route redirected to `/`. Signed-out DOM is ~35% of authenticated; flags/audit/IAM were never scanned by any URL pass.
- 5 source scans returned 0, and the detector said why: "19 files scanned with regex matching only (.ts). Rules that need a parsed page ... did not run on them; findings are an undercount, not a clean bill of health." A control fixture with box-shadow, Comic Sans, 9px text and #777 inside an Angular template literal produced zero primary findings.
- The one finding: body-text-viewport-edge on overview.ts:9 at 390px — real, but the documented no-breakpoints consequence, not a discovery.
- Zero false positives. The detector has no overflow rule and no element-sizing rule, so it missed both real layout defects.
- Authenticated coverage was obtained only by attaching the detector over --cdp on port 9222.

### Visual overlays: none

No detect.js ships in the skill's scripts directory, the CLI exposes no inject/overlay command, and the only browser driven was a throwaway Playwright profile — no human saw a tab. Fallback signal used: the --cdp attach, a programmatic scan, not a user-visible overlay.

## Overall Impression

The engineering discipline is well above the design that fronts it, and the gap is widest where it matters most. The evaluator's first frame is an empty rail, two sentences, and an instruction to pick from a navigation with nothing in it — on the arrival path PRODUCT.md names as carrying the most weight. The best-designed screen is reachable only by breaking a remote.

Biggest opportunity: make the Overview render the manifest — origin, version, requiredRole, apiMode, resolution state, load time per remote — so the first viewport IS the architecture rather than a sentence about it.

## What's Working

1. The unavailable boundary (module-unavailable.ts): refuses the apologetic illustration and hands the operator attempt count, failure class, and the literal error in mono. Retry primary, Reload only when the failure class warrants it, nav item stays clickable so the route back in is never removed.
2. One focus ring, visibly correct in both themes on secondary buttons, the active nav tint, and the dark navy ground. Declared once, imported by all four apps — hard to hold across a federation boundary.
3. The colour ration holds under measurement: muted text 7.24:1 / 7.34:1, body 17.06 / 15.27, nav 7.58 / 6.76. Only the active route and a status pill carry colour, which is why a red offline badge is impossible to miss.

## Priority Issues

### [P0] The cold open fails on the primary arrival path
Signed out at 1440x900: sidebar with one item, two sentences, ~750px blank, copy saying "Pick a domain from the navigation" when there is nothing to pick. Signing in changes nothing but the nav. Browser tab says `shell`.
Why: PRODUCT.md names this the highest-weight surface; Principle 4 requires surviving a cold open with no narration. Also contradicts the product's own truth that remote existence is public by design — the signed-out nav hides all three domains.
Fix: list the three remotes signed out with requiredRole and a sign-in affordance; make Overview a live per-remote status panel read from the manifest; fix `<title>` per route.
Command: /impeccable shape

### [P0] max-w-md silently resolves to 16px — token-namespace collision breaking the audit filter
Filter input renders 26px wide at every viewport. Markup is innocent (audit-home.ts:36, correct `<label class="mb-4 block max-w-md">` around a w-full input). Compiled rule: `.max-w-md{max-width:var(--atlas-spacing-md)}` — 1rem, not 28rem — because theme.css:12 registers --spacing-md, which under Tailwind v4 puts an `md` key on the spacing scale and shadows the container scale (--container-* appears zero times in built CSS).
Why: it is the only interactive control on the Audit domain and the sole expression of "Searchable" in its own headline. The trap stays armed: naming spacing tokens xs/sm/md/lg/xl breaks every future max-w-sm|md|lg the same silent way. max-w-md is currently the ONLY t-shirt-scale utility in the workspace, which is why this survived 14 green gates.
Fix: rename the spacing tokens off the t-shirt scale, or declare --container-* explicitly in the generated theme; add a gate assertion.
Command: /impeccable layout

### [P1] No responsive behaviour; sideways scroll on every route at phone width
Measured at 390px with content rendered: / 410px, /flags 409px, /audit 684px, /iam 584px. Sidebar shrinks to 141px (36% of viewport for four items), wordmark wraps, and on /audit the header controls sit entirely outside the viewport.
Why: even the near-empty Overview overflows, so the first action on a phone is a sideways scroll. A portfolio link on a phone is a confirmed arrival path. DESIGN.md records the gap honestly, but recorded is not acceptable on a primary arrival path.
Command: /impeccable adapt

### [P1] No confirmation, undo, or announcement on either destructive action; self-lockout reachable
sso-enforced toggles instantly; Deactivate applies instantly. No confirm, toast, or live region — [role=status], [aria-live], [role=alert] all empty on /flags, /audit, /iam before and after acting. The signed-in admin can deactivate her own session or self-demote to viewer.
Why: highest-stakes actions in the product with less feedback than a checkbox; a screen-reader user gets no acknowledgement. PRODUCT.md warns that zoneless/signals-first makes deliberate live-region announcements necessary. The BFF's last-admin and self-demotion invariants exist, but production runs apiMode: mock, so nothing enforces them in what ships.
Command: /impeccable harden

### [P2] Assistive-layer gaps axe structurally cannot see
No aria-current on the active nav item (route conveyed by tint alone). No skip link — six chrome stops precede content on every route. The flags toggle's accessible name is "Toggle sso-enforced" while its visible label is "Off": WCAG 2.5.3 label-in-name failure, and a violation of DESIGN.md's own rule that aria-label must begin with the visible label (IAM buttons obey it).
Command: /impeccable audit

## Persona Red Flags

**Alex (Power User)** — no filter shortcut bound; finds the filter only by clicking a 26px square; types a query, refreshes, loses it (not in URL), so no shareable link to a suspicious event, the one artefact an audit log exists to produce. No bulk select: three users, three clicks, three silent outcomes. Concludes "demo, not console" in under 60s.

**Sam (Accessibility-Dependent)** — no skip link, six chrome stops to content on every route. Focus ring excellent and clearly visible in both themes — the one thing that works perfectly. But nothing announces the current route, the toggle speaks "Toggle sso-enforced" while the screen says "Off", and filtering to "No events match the filter" is completely silent. Cannot tell whether any action succeeded.

**Riley (Stress Tester)** — three contradictions in two minutes, each on a surface named after what it gets wrong: "0 live" above four rows; "live from every domain" but toggling a flag produces no audit event (static fixtures, incl. a July 2026 row not from this session); "per environment" with no environment control. Credit: the empty-filter state keeps column headers on screen, as DESIGN.md promises.

**Morgan (Sceptical Technical Evaluator, project-specific)** — opens the live URL cold. Tab reads "shell". Empty rail telling them to pick from an empty nav. Does not know personas exist; localStorage is not a discoverable sign-in. If they find "Sign in as admin", Overview does not change. Holds the claim "manifest-driven runtime federation across four independently deployed origins" with zero on-screen evidence — no origin, version, apiMode, load timing, or link to 13 ADRs. Read: competent CSS discipline, unproven architecture — the exact inverse of the stated deliverable.

**Priya (in-fiction viewer, project-specific)** — follows a link to /iam, silently deposited on Overview. No message, no explanation, no request-access path; reloads, same thing, concludes the link is broken. On /flags she does get the read-only pill and visibly disabled toggles (handled well), but nothing says why or what would change it.

## Minor Observations

- "as viewer" is a sentence fragment as a button label; the pair only parses together and breaks apart in a screen reader's button list.
- IAM's Status column does two jobs — Deactivate button and the word "active" in one cell. The badge component is in use in the page header; status should wear it, action belongs in its own column.
- The role `<select>` is the only unstyled native control: 29px against the system's 34px, `rounded` against the One Radius Rule.
- Target sizes: flag toggles 45x30, role selects 81x29 — above the 24px 2.5.8 minimum, well below a comfortable 44px, and thumb targets at 390px.
- No h2 anywhere; every screen is one h1 then flat content.
- Native-federation debug logging still enabled at log level, printing bundle lists and import maps on every navigation in the deployed app.
- nav carries aria-label="Primary" — correct, keep it.
- Assessment A reported max-w-md absent from the shipped markup and DESIGN.md drifted. It is present at audit-home.ts:36; the doc is accurate and the cause is the token collision. The measured symptom was real.

## Questions to Consider

- What if the Overview WERE the manifest, so the first viewport is the architecture rather than a sentence about it?
- Why does the best screen in this product require a failure to reach?
- What is the console's answer to "prove it"? 13 ADRs, a 14-gate pipeline, four live Workers — and no link to any of it from inside the app.
- Should On/Off be a switch rather than a button? It would make aria-pressed visible and kill the label-in-name failure at the source.
- If colour is rationed to state, why do four emoji spend it on identity?
- Who is the audit log for if it does not record what you just did? One real cross-remote event on flag toggle would demonstrate ADR-0005's typed event bus in a single gesture — the highest-leverage change here.
