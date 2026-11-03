---
target: the Atlas Admin console
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/Users/elbaymalik/dev/eleo/atlas_admin_shell/apps/shell/src/app/layout/shell-layout.ts"
target_fingerprint: "sha256:129b02f64df81fcd994ee960ebda2fd8cb5f516d89ac36d810b78c35d201657c"
target_path: /Users/elbaymalik/dev/eleo/atlas_admin_shell/apps/shell/src/app/layout/shell-layout.ts
timestamp: 2026-11-03T21-11-48Z
slug: apps-shell-src-app-layout-shell-layout-ts
closed: true
---
Method: dual-agent (A: design review · B: detector and browser evidence). The first B reviewer was stopped, and a second finished its work from the saved files.
Target: apps/shell/src/app/layout/shell-layout.ts, scope the composed console. Mode: Operate.
Limit: nobody signed in on production. Sign-in failure and session-loss states come from code; the raw-ID header was simulated locally.

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Remote health and action status are excellent, but a failed sign-in only reaches the browser console |
| 2 | Match with the real world | 3 | Fits this audience, but `resolved` is unexplained and audit entries show raw text like `admin -> viewer` |
| 3 | User control and freedom | 3 | One-click Undo works, but has one level, never expires and loses keyboard focus |
| 4 | Consistency and standards | 3 | Visually tight, but one failure has three names: `unreachable`, `offline`, `down` |
| 5 | Error prevention | 2 | Refusals exist, but one is false, and `sso-enforced` flips as easily as a minor flag |
| 6 | Recognition rather than recall | 2 | Most explanations live in hover `title` text, which touch users don't get and keyboard users may not |
| 7 | Flexibility and efficiency | 1 | No shortcuts, sorting or bulk actions, and the audit filter isn't in the URL |
| 8 | Aesthetic and minimalist design | 3 | Strong restraint; weak spots are the `Session:` debug line and an empty reserved band |
| 9 | Error recovery | 2 | The remote failure screen is near excellent, but sign-in failures have no recovery screen |
| 10 | Help and documentation | 2 | Overview explains itself, but nothing links to the repo, README or ADRs |
| | **Total** | **23/40** | **Acceptable** |

Cognitive load: moderate, 3 of 8 failed (signed-out Overview hierarchy; remembering which role a locked item needs; rarely needed detail shown while `resolved` is hidden). Admin `/iam` has 6 enabled row controls, with no search or paging.

## Design Specificity Verdict

Split. The Overview registry, remote failure screen and locked nav could only belong to this product. `/iam`, `/flags` and `/audit` are disciplined but generic admin screens. A signed-out visitor is told about runtime composition but never sees a remote load.

Detector: 4 findings, no false positives, all in apps/shell/src/app/overview/overview.ts. `line-length` x3 at lines 57, 157, 162 (up to 93 chars; max-w-prose computes to 655px). `straggler` x1 advisory at line 157 at 390px. Source scan 0, but weak: templates in .ts effectively get pattern rules only. Signed-in CDP scans (4 routes, 2 widths, 2 themes) are the real evidence: one `line-length` on `/` at 1440, otherwise clean.

Measurements the detector missed: axe 1 serious `scrollable-region-focusable` on the `/audit` table at 390px; touch targets at 390px: `Sign in with Github` 32px, `Deactivate` and `Sign out` 34px, menu and theme buttons 36px.

Confirmed fixed since the first critique: audit filter 448px (was 26px); no sideways scroll at 390px; per-route titles; skip link; aria-current; text contrast at least 5.75:1.

Not available: no overlay (no user-visible browser). Local URL scan timed out twice; CDP scans replaced it, leaving 1280x800 unscanned locally.

## Overall Impression

Identity is now the weak link. A failed sign-in shows no message and a missing name shows a raw ID. Biggest opportunity: one honest way to see the product working without signing in. Peak: the failure screen. Valley: finishing GitHub consent and landing on the same signed-out page with no explanation.

## What's Working

1. The Overview registry: claim and proof share one frame, with real cross-origin addresses and badges that change.
2. The remote failure screen: the rest of the console kept working with a remote blocked, and Retry recovered in place.
3. Consistency across three separately deployed remotes, in both themes.

## Priority Issues

### [P0] A production visitor can't get past the Overview
P0 while the Nhost problem is open, P1 after. Everything beyond `/` needs GitHub sign-in on a provider that sleeps and is unreliable; other accounts should get `viewer`. Fix: a labelled "Explore with demo data (no account)" path loading the real remotes with a persistent `demo` badge; if that conflicts with ADR-0014, let Overview load a remote on demand.
Command: /impeccable onboard

### [P1] Signing out leaves a writable admin screen
On `/iam`, sign-out keeps the table with `Session: anonymous`; Deactivate then reports success while the nav shows IAM locked. A failed refresh probably does the same (from code). Fix: when a session ends, re-check the route, go to `/` with a notice, disable writes.
Command: /impeccable harden

### [P1] The console says nothing when identity goes wrong
Failed sign-in logs to console only; no busy state on sign-in; viewer silently redirected from `/iam`; sign-in loses the destination; from code, the token exchange has no timeout, so a blank page is possible during a wake. Fix: one shell-level notice line, a timeout, a busy state, a remembered destination.
Command: /impeccable harden

### [P1] The fallback identity is a raw ID, and it causes worse problems
Header shows a 278px UUID beside `admin`; IAM line becomes `Session: (admin)`. From code: a missing email is `''`, which `?? 'system'` doesn't catch (iam-users.store.ts:99, flags.store.ts:108), so the audit trail gets a blank actor; the self-removal rule compares emails only. Fix: labelled short form, user ID for actor and self-checks, label or remove the `Session:` line.
Command: /impeccable harden

### [P2] Destructive actions are well designed but unfinished
False "last administrator" refusal after deactivating Grace while the header says `2 admins` (iam-users.store.ts:93, :112). "is now a admin" (:161), "1 admins" (iam-home.ts:25). Keyboard Undo drops focus to body. Undo stays after undoing; messages never expire. `Deactivate` looks like `Activate`; `variant="danger"` unused in apps; no extra step for `sso-enforced`.
Commands: /impeccable clarify, /impeccable harden

## Persona Red Flags

Alex: no shortcuts or sorting; filter not shareable; `2026` and `live` find nothing; `6 events · 2 live` badge ignores the filter; timestamps lack a zone.
Sam: Undo loses focus; mobile drawer Tab skips links and runs behind the scrim; `/audit` has no live region; reasons depend on hover text.
Sceptical evaluator: "Sign in with Github" (shell-layout.ts:152); no ADR or repo links; audit trail clears on reload; `mock data` only on Overview, so `/iam` looks real.
In-fiction viewer: "Toggle features for this deployment." above unusable toggles; silently sent away from `/iam`; no read-only explanation on touch.

## Minor Observations

Mobile `/iam` clips 142px with `Deactivate` off-screen and no scroll cue. Content starts at y=244/200/164 on IAM/flags/audit. Desktop control heights 33/34/30px. `offline` truncates "Identity & Ac…". Failure details omit the failing origin. Nhost wake note appears on local mock. Copy says 3 origins, PRODUCT.md says 4. Seed dates 4 months old.

## Questions to Consider

1. If runtime composition is the one uncopyable claim, why does a signed-out visitor never watch a remote arrive?
2. Does requiring GitHub sign-in on a sleeping free project prove more than it costs, when an ADR already records that real auth works?
3. If honesty outranks polish, should `mock data` sit in the header on every route, with `/audit` saying the trail clears on reload?
