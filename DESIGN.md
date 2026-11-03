---
name: Atlas Admin Shell
description: A flat, dense control plane where colour only ever carries state.
colors:
  brand-primary: "#4f46e5"
  brand-primary-strong: "#4338ca"
  brand-accent: "#0ea5e9"
  status-success: "#16a34a"
  status-warning: "#d97706"
  status-danger: "#dc2626"
  status-danger-strong: "#b91c1c"
  light-bg: "#f8fafc"
  light-surface: "#ffffff"
  light-text: "#0f172a"
  light-text-muted: "#475569"
  light-border: "#e2e8f0"
  light-border-strong: "#475569"
  light-on-brand: "#4338ca"
  light-on-success: "#166534"
  light-on-warning: "#92400e"
  light-on-danger: "#b91c1c"
  dark-bg: "#0b1120"
  dark-surface: "#111a2e"
  dark-text: "#e2e8f0"
  dark-text-muted: "#94a3b8"
  dark-border: "#1e293b"
  dark-border-strong: "#64748b"
  dark-on-brand: "#a5b4fc"
  dark-on-success: "#86efac"
  dark-on-warning: "#fcd34d"
  dark-on-danger: "#fca5a5"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: "2rem"
    letterSpacing: "normal"
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: "1.75rem"
    letterSpacing: "-0.015em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
  body-sm:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: "1.25rem"
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: "1rem"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: "1rem"
rounded:
  sm: "0.25rem"
  md: "0.5rem"
  lg: "0.75rem"
  full: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.brand-primary}"
    textColor: "#ffffff"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    height: "2.25rem"
  button-primary-hover:
    backgroundColor: "{colors.brand-primary-strong}"
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    height: "2.25rem"
  button-danger:
    backgroundColor: "{colors.status-danger}"
    textColor: "#ffffff"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    height: "2.25rem"
  button-danger-hover:
    backgroundColor: "{colors.status-danger-strong}"
    textColor: "#ffffff"
  button-danger-quiet:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-on-danger}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.375rem 0.75rem"
    height: "2.25rem"
  badge-neutral:
    textColor: "{colors.light-text-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
  badge-success:
    textColor: "{colors.light-on-success}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
  badge-danger:
    textColor: "{colors.light-on-danger}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "0.125rem 0.5rem"
  nav-item:
    textColor: "{colors.light-text-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  nav-item-active:
    textColor: "{colors.light-on-brand}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
  input-search:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "0.375rem 0.75rem"
    height: "2.25rem"
  icon-button:
    backgroundColor: "{colors.light-surface}"
    textColor: "{colors.light-text}"
    rounded: "{rounded.md}"
    height: "2.25rem"
    width: "2.25rem"
---

# Design System: Atlas Admin Shell

## Overview

**Creative North Star: "The Operations Console"**

Atlas is built for someone who lives in it all day. Nothing here is composed to be
admired; it is composed to be scanned. Rows are tight, separators are hairlines, and
the eye travels down a list of fifty audit events without a single ornament to step
over. The register is workmanlike on purpose — an administrator revoking access or
flipping a rollout is mid-task, and the interface's job is to get out of the way
while staying unambiguous about what is on, who did it, and what is broken.

The system earns its character from restraint rather than expression. Surfaces are
flat. Type is the operating system's own. The entire palette is neutral slate until
something has *state* — and then, and only then, colour arrives: indigo for the
action you are meant to take or the route you are on, green/amber/red for a
condition the system is reporting. Because colour is rationed this way, a single
red badge in a sidebar is impossible to miss. That rationing is the design.

What this is not: a marketing surface. There is no hero, no gradient, no
illustration, and no moment that exists to impress. The personality lives in two
places only: the drawn icon set, which is stroke-only and inherits its ink so it can
never spend colour; and the Overview, which renders the federation registry itself
rather than describing it.

**Key Characteristics:**

- Flat by construction — no shadow exists anywhere in the system.
- Hairline 1px borders and a single surface-over-background tonal step carry all
  structure.
- Neutral slate ground; colour is reserved for state and action.
- Dense vertical rhythm — `0.5rem`/`0.75rem` control padding, `1.5rem` page padding.
- Native system type, no webfont, no font loading cost.
- Every semantic colour is defined twice, light and dark, and components read only
  the semantic name.
- One focus ring for the whole system, in the text colour, offset so it never sits
  on a control's own fill.
- One drawn icon set, stroke-only at a single weight, always `currentColor`.

## Colors

A neutral slate ground with one interactive voice and three status hues, drawn from
the Tailwind ramp. The palette's defining property is that it is almost entirely
colourless until the system has something to report.

### Primary

- **Control Indigo** (`brand-primary`): the single interactive voice. Primary button
  fills, the active navigation route, the pressed state of a flag toggle, and the
  hover border on secondary controls. Nothing decorative ever wears it.
- **Control Indigo Deep** (`brand-primary-strong`): the hover and active step beneath
  Control Indigo. It is also the *light-mode* `on-brand` ink — the colour of text and
  icons sitting on a 10% indigo tint — because the fill itself is too light to carry
  AA-sized text.

### Secondary

- **Signal Sky** (`brand-accent`): **declared but unconsumed.** Defined in
  `tokens/color.json` and generated into CSS, referenced by no component. It is a
  reserved second voice, not part of the live system. Either adopt it deliberately or
  delete it; leaving it is how a palette quietly becomes two palettes.

### Tertiary

Status, not decoration. Each hue appears only as a 15% tint behind a dedicated
foreground ink — never as a solid fill behind body text, and never to set a mood.

- **Operational Green** (`status-success`): a healthy remote, an enabled flag, a live
  event, an admin role.
- **Attention Amber** (`status-warning`): a remote mid-load, and the `demo` badge.
  Both say the same thing: what is on screen is not the settled, real state.
- **Fault Red** (`status-danger`): an unavailable remote, a failed request, a destructive
  action. **Fault Red Deep** (`status-danger-strong`) is its hover step and doubles as
  the light-mode danger ink.

### Neutral

Light mode reads as paper; dark mode as a deep navy-slate rather than true black, so
that `surface` can lift above `bg` without either becoming grey mush.

- **Page Ground** (`light-bg` / `dark-bg`): the application canvas behind everything.
- **Panel White / Panel Slate** (`light-surface` / `dark-surface`): the sidebar,
  header, inputs, and error panels. Always one step *lighter* than the ground, in both
  themes — that is what makes the tonal step legible without a shadow.
- **Ink** (`light-text` / `dark-text`) and **Muted Ink** (`light-text-muted` /
  `dark-text-muted`): primary and secondary text. Muted Ink carries table headers,
  descriptions, timestamps, and definition labels.
- **Hairline** (`light-border` / `dark-border`): separation between content — panel
  edges, table rows, list items. It is deliberately low-contrast and must never be
  used on a control.
- **Control Edge** (`light-border-strong` / `dark-border-strong`): the boundary of an
  interactive control. Measurably distinct from Hairline and the reason both exist.
- **Scrim** (`light-scrim` / `dark-scrim`): the wash behind an overlay, used at 50%.
  It is the one semantic token that is dark in **both** themes, because a scrim is a
  shadow rather than a surface — its job is to recede what is under it. Reaching for
  `text` here lightened the page in dark mode, which is the opposite effect.

### Named Rules

**The Rationed Colour Rule.** The interface is neutral until something has state.
Control Indigo marks the action to take or the route you are on; a status hue marks a
condition the system is reporting. If a colour is doing neither, it does not belong on
the screen.

Icons are inside this rule, not exempt from it. They are drawn in `currentColor`
precisely so they cannot carry a hue of their own — which is exactly what the emoji
they replaced did, in the most visible component in the product.

**The Two Borders Rule.** `border` separates content; `border-strong` bounds a
control. They are not interchangeable and the distinction is load-bearing: a control
outlined only in `border` fails WCAG 1.4.11, and an e2e suite measures exactly this.
When a control's resting outline is its only affordance, it uses `border-strong`.

**The Paired Ink Rule.** Every status tint has a dedicated `on-*` ink that inverts
between themes — dark on the tint in light mode, light in dark mode. The status hue
itself does not clear AA at label size on its own 15% tint (measured 3.65:1), so a
tinted surface is never allowed to borrow the hue as its own text colour.

**The Semantic-Only Rule.** Components read `bg`, `surface`, `text`, `text-muted`,
`border`, `border-strong`, `on-*`. They never read a `light-*` or `dark-*` token
directly. The semantic alias is what makes one component correct in both themes, and
reaching past it is how a dark-mode bug ships.

## Typography

**Body Font:** the native system UI stack (`ui-sans-serif, system-ui, sans-serif`),
inherited from Tailwind's preflight. **This is deliberate, not an oversight:** no
webfont is loaded, so type costs zero requests and zero layout shift, and the console
looks native to the operator's own OS. Future work may not introduce a webfont.

**Mono Font:** the native monospace stack. It currently arrives via Tailwind's
`font-mono` default and **should become a real token** — it is already carrying
meaning rather than decoration (literal flag keys, raw error strings), which makes it
a semantic choice that deserves to be declared rather than inherited.

**Character:** invisible by design. System type on a flat slate ground reads as
instrumentation rather than authorship; hierarchy comes from weight and scale, never
from a second family.

### Hierarchy

- **Headline** (600, `1.5rem`/`2rem`): the page title, one per screen — "Overview",
  "Feature Flags", "Audit Logs", "<Module> is unavailable".
- **Title** (600, `1.125rem`, tight tracking): the product wordmark in the sidebar
  head. Nothing else uses it.
- **Body** (400, `1rem`): page-level descriptive prose, constrained to `max-w-measure`.
- **Body Small** (400, `0.875rem`): the working size of the system — table cells,
  list rows, button labels, inputs, descriptions, help text. Most of the interface is
  this size.
- **Label** (500, `0.75rem`): badge text only.
- **Mono** (400, `0.75rem`–`0.875rem`): literal values the user may need to copy or
  read exactly — flag keys, raw error details.

### Named Rules

**The Working Size Rule.** The console's default is `0.875rem`, not `1rem`. Density is
the point: a size bump reads as a demotion of everything around it, so a new
component matches the working size unless it is a page title.

**The Literal Value Rule.** Monospace means "this string is exact" — a key, an
identifier, an error as the system emitted it. It is never used for emphasis or
flavour.

## Layout

A fixed two-column application frame: a `15rem` (240px) sidebar holding the wordmark,
primary navigation and per-remote health, beside a fluid content column with a
`3.5rem` (56px) header. Both the sidebar edge and the header underside are single
hairlines; the frame fills the viewport (`min-h-screen`) and content scrolls inside it.

Every routed screen is a `section` with uniform `1.5rem` (p-6) padding, opening with a
header row that pairs a title block against right-aligned status badges and wraps
(`flex-wrap`) when crowded. The three domain screens share that row as `UiPageHeader`,
so what follows it starts at one height on all of them at the desk (188px at 1440).
Vertical rhythm runs on a small set of steps — `0.25rem` within a control,
`0.5rem`–`0.75rem` between related controls, `1rem` between row groups, `1.5rem` between
a screen's major blocks. Reading measure is capped with `max-w-measure` on every paragraph
and `max-w-md` on the filter input; tables and lists run the full column.

`max-w-measure` is `54ch`, a token in `dimension.json`, and it replaced `max-w-prose` for
running text. `ch` is the width of the digit 0, wider than an average character here, so
Tailwind's `65ch` came to as many as 93 characters a line; `54ch` comes to about 73, at
either text size. The Overview's paragraphs also take `text-pretty`, so a line does not end
on a lone word. The boundary's definition grid keeps `max-w-prose`, because it is not prose.

**Responsive behaviour** turns on a single breakpoint, `md` (768px), and nothing else.
One breakpoint is the whole vocabulary: the console is either at a desk or in a hand,
and inventing intermediate states would mean maintaining layouts nobody uses.

- **At `md` and up:** the frame described above — a static `15rem` sidebar beside a
  fluid content column.
- **Below `md`:** the sidebar leaves the flow entirely (`fixed`, `-translate-x-full`,
  `invisible`) and becomes a drawer opened from a control in the header. It is
  `invisible` rather than merely translated, which is what keeps every nav link out of
  the tab order while it is closed — a transform alone would leave them focusable off
  screen. A scrim covers the content, Escape closes it, and navigating closes it.
  Open, it is a modal: focus enters on the first link, the rest of the console is
  `inert`, Tab wraps inside the panel, and the panel carries its own close button,
  because the control that opened it is under the scrim. Closing returns focus to
  that control; navigating moves it to the screen the visitor asked for.
- **The drawer does not slide.** The system's motion vocabulary is colour; a panel
  that animated its geometry would be the first thing here to move, and an instant
  panel cannot be caught half-open by a fast tap.
- **Dense tables scroll inside themselves,** never moving the page. An operator
  expects to pan a ledger, and dropping columns would hide the comparison the table
  exists for — but the document itself must never pan, or the chrome drifts off screen
  with it. The scrolling box is `UiScrollRegion`: a named, focusable region only while
  there is something to pan, so a keyboard can reach it and a table that fits costs no
  tab stop. A cut-off edge does not say a column is missing, so `/audit` also says in words
  that the table scrolls, for as long as it does.
- **The Overview and the IAM roster are the exceptions** and change shape rather than
  scrolling. Below `md` each remote becomes a block instead of a table row, because it
  is the arrival screen and the origin — the part carrying the architecture claim — has
  to survive the narrow viewport. Each user becomes a block too, because that table is
  a list of people to act on, and panning put the action itself off screen. It stays a
  table to a screen reader, through explicit roles. Just above `md`, where the sidebar
  leaves that table short, the email breaks after its `@` rather than pushing Actions off.
- **Touch targets** reach 44px below `md` on every control (buttons, nav links, icon
  buttons, the filter, the role select, the flag toggle) and return to their dense
  sizes at the desk. Links inside a sentence are exempt. The header's badges stack below
  `md`, in the height the header already has, so a 320px phone keeps each button on one line. A sign-in button can still be too wide
  there, so the header wraps, intrinsically, and takes the theme toggle down with it. The pattern is `min-h-11` with
  `md:min-h-9` on a button, select or input, and `responsive.spec.ts` measures it on every
  route.

### Named Rules

**The One Breakpoint Rule.** `md` (768px) is the only breakpoint in the system. A
component that needs a second one is usually a component that should change shape
once, not three times — and every extra breakpoint is another pair of layouts that has
to stay correct in both themes.

**The Page Never Pans Rule.** Horizontal scrolling belongs to a container, never to
the document. A table may overflow inside its own box; if the document scrolls
sideways, the chrome leaves with it and the page is broken, not dense.

**The Uniform Page Padding Rule.** Every routed screen opens with `p-6`. The frame
owns the chrome; the screen owns its content and nothing in between. A screen that
sets its own outer padding breaks alignment with the module beside it in the nav,
which is the one visual promise federation has to keep.

**The Header Row Rule.** A screen title and its status badges live on one wrapping
flex row, title block left, badges right. It is how an operator finds "what is the
state of this domain" in the same place on every screen, including screens owned by
different teams in different repositories. On a domain screen this is `UiPageHeader`,
which also holds a one-line note under the subtitle and the action status under the
badges. A screen does not build its own.

**The One Control Height Rule.** Buttons, selects, inputs and the theme toggle are `2.25rem`
at the desk and `2.75rem` below `md`, so controls side by side line up. A filled button
carries a transparent border to match an outlined one. `page-layout.spec.ts` measures this
and the content start.

## Elevation & Depth

**There is no elevation system, and that is a gap rather than a decision.** No
`box-shadow` exists anywhere in the workspace. Depth today is conveyed by exactly two
devices: a 1px hairline border, and a single tonal step where `surface` sits one value
lighter than `bg` in both themes (white on near-white in light; `#111a2e` on `#0b1120`
in dark).

For the surfaces that currently exist — a sidebar, a header, inline error panels, an
input — flat is genuinely sufficient, and the tonal step is doing real work. But the
system has no answer for a surface that must float above the page, and the moment one
appears (a dialog, a popover, a dropdown, a toast) the two devices available will not
be enough: a hairline cannot say "this is on top of that".

**Future work is expected to design an elevation vocabulary, deliberately, before the
first floating surface ships.** Until then, do not improvise a one-off shadow on a
single component — an ad-hoc value becomes the de facto system without anyone choosing
it.

### Named Rules

**The Tonal Step Rule.** A raised surface is lighter than its ground in *both* themes.
Dark mode does not invert the relationship — `dark-surface` is lighter than
`dark-bg` for the same reason `light-surface` is lighter than `light-bg`. Any new
surface token keeps that direction or the structure stops being readable.

## Shapes

One radius does nearly all the work: `0.5rem` (`rounded-md`) on buttons, nav items,
error panels and the icon button — enough to read as a control, not enough to read as
soft. Badges are fully round (`rounded-full`, 9999px), which is the only strong form
contrast in the system and the reason a badge never reads as pressable. The search
input is the single outlier at `0.25rem`.

Form language is otherwise rectilinear and unclipped: no masks, no angles, no circles
beyond the badge, and no decorative geometry anywhere. Borders are uniformly 1px.

`rounded-sm` and `rounded-lg` are **declared but unconsumed** — generated into CSS and
referenced by nothing. The live form language is two radii, not four.

### Named Rules

**The One Radius Rule.** Interactive and container surfaces are `0.5rem`. Deviating
needs a reason the shape itself communicates — as `rounded-full` does on a badge,
where the pill form is what distinguishes a status from a button.

## Components

Dense and workmanlike. Tight padding, hairline separators, high information per pixel —
built for someone scanning fifty rows, not admiring one. Controls sit flat and
bordered at rest and only take colour when they are the primary action, the active
route, or a reported state.

### Buttons

- **Shape:** gently rounded (`0.5rem`), 1px border where bordered, no shadow in any
  state.
- **Padding and type:** `0.375rem 0.75rem`, working size (`0.875rem`), weight 500,
  with a `0.5rem` gap for an optional leading glyph.
- **Primary:** Control Indigo fill, white text; hover steps to Control Indigo Deep.
- **Secondary:** `surface` fill with a **Control Edge** border and `text` ink; hover
  shifts the *border* to Control Indigo rather than filling. This is the system's most
  used control.
- **Danger:** Fault Red fill, white text; hover steps to Fault Red Deep. It commits a
  destructive action that has already been asked about.
- **Quiet danger:** `surface` fill with `on-danger` border and ink; hover takes the Fault
  Red fill. It offers a destructive action that repeats down a list. "Deactivate" × 40 in
  solid red would spend the colour ration on what is only an option, and an `unavailable` badge
  would stop being impossible to miss. A refused one goes back to Secondary: it is a fact
  about the row, not an action on offer.
- **Toggle:** a Secondary button with `toggled` set, which carries `aria-pressed` and takes
  the Control Indigo fill when on. A flag's On/Off control is this, not a button of its own.
- **Transition:** `transition-colors` only — colour moves, geometry never does. No
  transform, no lift.
- **Disabled:** `cursor-not-allowed` with 50% opacity.
- **Busy over disabled:** for an action the user just triggered, the component takes
  `aria-busy` rather than `disabled`, because disabling the focused control moves
  focus to `<body>` and loses the operator's place. Guarding against the duplicate
  activation is the caller's job.
- **Repeated labels:** when a label repeats down a table ("Deactivate" × 40), the
  control carries an `aria-label` whose text begins with the visible label (WCAG
  2.5.3).

### Badges

- **Style:** fully round pill (9999px), `0.125rem 0.5rem`, label type (`0.75rem`/500).
- **Tone:** a 15% status tint behind the matching `on-*` ink — success, warning,
  danger — or, for neutral, a 10% ink tint with Muted Ink text.
- **No border, no shadow.** The pill shape and the tint are the entire treatment.
- **Role:** badges report; they are never interactive and never a target.

### Navigation

- **Style:** full-width row, `0.5rem 0.75rem`, `0.5rem` radius, `0.75rem` gap between
  glyph and label, working size, Muted Ink at rest.
- **Hover:** lifts to `surface` fill with full-strength `text` ink.
- **Active:** 10% Control Indigo tint with `on-brand` ink at weight 500 — the tint,
  not a fill, and the only place in the sidebar colour appears unaided.
- **Disabled:** `pointer-events-none` at 40% opacity, with `aria-disabled` set. A
  domain the current role may not open carries a **lock mark** in the row, because a
  role badge there pushed long labels onto a second line, and truncating the label to fit
  was worse than either. The requirement is written on a line of its own under the row,
  "Requires the admin role", in label type and Muted Ink, indented to the label. It sits
  outside the link so the 40% does not reach it, and it needs no hover.
- **A down remote keeps its href.** The nav item for a failed module stays clickable
  and gains a danger badge, because that row *is* the way back in (ADR-0007). Removing
  or disabling it strands the operator.
- **Project links** sit at the foot of the sidebar under a hairline: the source and the
  decision records, underlined in Muted Ink so they do not read as routes, opening in a
  new tab with the `external` mark, because a mock session's changes live in this one.
- **Icons** come from the drawn set (see Icons below). The manifest supplies the
  *name*; the drawing lives in the design system. Always `aria-hidden`, with the
  label carrying the accessible name.

### Icons

- **The set:** `overview`, `users`, `flag`, `ledger`, `compass`, `sun`, `moon`, `menu`,
  `close`, `lock`, `external`, in `libs/shared/ui/src/lib/icon/`. Stroke-only on a 20px grid at a single `1.5`
  weight, round caps and joins, no fills, no second colour.
- **Colour:** always `currentColor`. An icon takes the ink of whatever it sits in —
  Muted Ink in a resting nav item, `on-brand` in the active one — which is what keeps
  it inside the colour ration rather than exempt from it.
- **Naming:** the manifest carries an icon *name*, not a glyph, so a domain's icon is
  a registry edit like everything else about it (ADR-0004). An unrecognised name
  renders verbatim, because the manifest ships independently of this bundle and a
  deploy must never empty the nav.
- **Size:** 20px in the nav and in tables; 22px for the wordmark; 16px for a mark beside
  text, such as `lock`, `external` and a notice's `close`. Nothing else.

### Inputs

- **Style:** `surface` fill, **Control Edge** 1px border, `0.25rem` radius,
  `0.375rem 0.75rem` padding, `2.25rem` tall, working size, Muted Ink placeholder.
- **Label:** visually hidden (`sr-only`) where the placeholder carries the visible
  affordance — the accessible name is never dropped, only hidden.
- **Focus:** the shared ring — a 2px `text`-coloured outline at a 2px offset. See
  The Focus Ring Rule below; it is declared once, globally, not per component.

### Cards / Containers

There are no cards. Grouping is done by hairline-separated rows and the sidebar/header
panels. The only panel-like surface is the inline error block: `surface` fill, a 40%
Fault Red border, `0.5rem` radius, `1rem` padding, `role="alert"`, pairing the message
against a secondary **Retry**.

### Tables

- Full-width, left-aligned, working size, `<caption>`-less with `scope="col"` headers.
- Header row: Muted Ink, weight 500, `0.5rem` vertical padding, closed by a hairline.
- Body rows: separated by a 60%-opacity hairline — lighter than the header's, so the
  header reads as structure and the rows as content.
- Timestamps are `whitespace-nowrap`, always in UTC and saying so (`2026-07-08 09:12 UTC`),
  with the full ISO value on `title`.
- An empty result renders a full-width Muted Ink row inside the table, never a bare
  page message — the column headers stay on screen so the operator can see what they
  filtered.
- A filter lives in the URL (`?q=`), so a view can be shared and survives a reload, and
  its count is reported by a polite live region once typing pauses, not on every key. It
  searches everything the row shows: date, actor, action, detail, target and `live`. A
  count badge above it counts what is on screen (`1 of 6 events · 0 live`).

### Action Status

The acknowledgement line each screen that writes carries, in its header row, under the
badges.

- **Always in the DOM, even when silent.** It is a `role="status"` / `aria-live="polite"`
  region, and a region inserted at the same moment its text appears is frequently never
  announced — assistive tech watches regions it already knows about. The element renders
  unconditionally and only its contents change.
- **`polite`, never `assertive`.** The operator did this on purpose; it can wait for a
  pause rather than interrupt them.
- **It reserves its height, where nothing shows.** Reserving space stops an arriving
  message shifting the rows beneath it, but an empty band between two blocks reads as a
  hole. So at the desk it sits beside the title block, whose height is already paid for,
  right-aligned and costing nothing. Stacked on a phone it overlaps the header's bottom
  margin instead of adding to it. One line and Undo never move the page. A second-change
  note can wrap past the reserved height and move it by a few pixels at the desk, or by
  the extra lines on a phone.
- **It carries Undo, not a confirmation.** A confirm dialog interrupts every action to
  guard against the rare one, and an operator working down a list learns to dismiss it
  unread. Undo keeps the common path at one click and makes the rare mistake cheap.
- **Undo performs the inverse action**, through the same API call and the same event
  publication — so the audit trail shows the flag going on and then off, rather than an
  edit silently vanishing from the record.
- **An offer belongs to its session.** A store outlives a sign-out in the remote's cached
  route injector, so it withdraws Undo when the user or role changes, and a write landing
  after that makes no offer. Whoever signs in next is not handed someone else's change.
- **Undo happens once.** The line then reads `Undone: …` with no Undo beside it. If the
  undo fails, the change still stands, so the offer comes back.
- **Focus goes back to the row.** Undo leaves with its offer, so focus returns to the
  control that made the change rather than falling to `<body>`. The slot that holds the
  Undo button stays mounted; only the button inside it comes and goes.
- **It expires.** 12 seconds with Undo, 6 without, plus 60ms a character for reading. The
  clock stops while the pointer or focus is on the line and while the tab is hidden, so
  nobody loses Undo while reaching for it or by looking away.
- **One Undo at a time, and it says so.** A change to another control takes over the
  offer, and the line says which earlier change can no longer be undone and that its row
  is the way back. Changing the same control again reverses it directly, so nothing is lost
  and nothing is said.

### Page Header

`UiPageHeader`, the header row of `/iam`, `/flags` and `/audit`. Three remotes kept their
own copies and drifted until the content started at 244, 200 and 164px.

- **Title block:** the Headline, the subtitle as Body in Muted Ink, then a note line in
  Body Small. The note is the session line on `/iam`, the read-only reason on `/flags` and
  the in-memory line on `/audit`.
- **The note line holds its height at the desk, even empty.** That is what lines the
  content up. It costs an admin on `/flags` an extra `1.25rem` above the list. On a phone it
  collapses, since nothing there lines up side by side.
- **Reports column:** the badges, then the action status. Its width comes from a `20rem`
  basis rather than its content, so a message arriving cannot wrap it onto a new line. It
  stacks under the title block when the two no longer fit, which is an intrinsic wrap and
  not a second breakpoint.

### Shell Notice

One line the shell uses to say what happened to the visitor's identity: a failed
sign-in, a provider that did not answer, a route that declined them, a session that
ended. It sits at the top of `main`, on `surface` with a hairline under it, aligned to
the screens' `p-6` edge.

- **Always in the DOM, like Action Status, but it does not reserve height.** A silent
  region collapses to nothing. It is rare, so a permanent empty strip on every screen
  would cost more than the shift when one arrives. A region with `display: none` is not
  watched by assistive tech, so it collapses by having no padding and no border.
- **One at a time, and it retires itself.** The newest message explains the screen, and
  navigating on clears it. It can also be dismissed, which moves focus to `main` rather
  than dropping it to `<body>`.
- **Two tones.** Normal `text` for something to know ("Signed out."), `on-danger` for
  something that failed. No fill and no coloured edge, per The Rationed Colour Rule.
- **It never shows text from the URL.** A provider error reaches the screen only as a
  short machine code, because anyone can craft that link. The free-text description
  goes to the console.

### Demo Session

A visitor-chosen way in on mock data (ADR-0015), and only ever visible as itself.

- **The way in** is one primary button above the registry on the signed-out Overview,
  "Explore with demo data (no account)", with a line under it saying what it is not. It
  is absent from the DOM when the deployment does not offer it.
- **The header says so on every route.** A `warning` `demo` badge and a secondary **Exit
  demo** take the place of the name, role and Sign out. The header never shows a demo a
  name or a role badge, because together those are what a real session looks like.
- **The strip says what the badge means.** It sits at the top of `main` above the shell
  notice, on `surface` with a hairline, and states that the edge BFF is not exercised. It
  is a `polite` status region that is always in the DOM and collapses like the notice,
  and it carries the sign-in control while the demo runs, since the header is full.
- **`mock data` is not part of the demo.** That neutral header badge shows on every route
  whenever `apiMode` is `mock`, whoever is signed in, because a screen with no label reads
  as real. `/audit` adds a line under its subtitle saying its trail lives in this tab.
- **Focus goes to `main`** when the control just pressed disappears, on the way in and on
  Exit demo, rather than dropping to `<body>`.

### Short ID

A long identifier as `3f6c…91c6`, in mono under The Literal Value Rule, used when an
account has no name or email. It is a button, because a `title` is out of reach of a
keyboard or a touch screen. Pressing it opens the full value; Escape or moving focus
away closes it. The panel floats but stays flat (`surface`, Control Edge border, no
shadow), the same treatment as the skip link, so it adds nothing to an elevation
vocabulary the system does not have yet. Beside it goes a label saying what the id
belongs to, such as "GitHub account".

### Refusals

Some actions are not undoable because they would remove the ability to undo them:
demoting yourself, deactivating your own session, or removing the last administrator.
Those controls are **disabled and say why in visible text** beneath the control, in
label type and Muted Ink, tied to it by `aria-describedby` or carried in its accessible
name. Never a `title`: a tooltip on a disabled control needs a pointer, on something that
has stopped responding to one. A reason shared by every control on a screen is written once,
above them: "Only admins can change feature flags." on `/flags`, and the session line for
being signed out.

The verb and the status are one word: `Deactivate` leaves a user `deactivated`, in the row's
status badge, the action message and the audit trail.

The IAM header counts **active admins**, and the refusals use that same number. It is what
`wouldRemoveLastAdmin` counts at the edge (ADR-0011): a deactivated admin cannot cover for
a working one, and demoting one removes nobody's access, so it is never refused as the last.

**These are error prevention, not security.** The edge BFF is the authorization boundary
(ADR-0011) and the same invariants live there; the client only hides things. They exist
here because production runs `apiMode: 'mock'`, where nothing else would stop an
administrator demoting themselves out of the screen they are standing in.

With nobody signed in, every write is refused, in the store as well as on the control.
The shell also leaves a protected route when a session ends, but the store does not
rely on that having happened yet. "Yourself" is matched on user id first, then on email
when there is one, since two blank addresses are not the same person.

### Signature Component — the Overview Registry

The landing screen is a table of `federation.manifest.json`: one row per remote, with
its route, the **origin it is actually served from**, the role it requires, and
whether its module resolved at boot. Header badges carry the manifest version and the
active `apiMode`.

It is a table, not a grid of cards, for two reasons: it is tabular data, and the
console already taught the operator this table language on `/audit` and `/iam`.

A domain the visitor may open is a link to it, underlined in the row's own ink. One they
may not stays text, like its locked nav item, with the Requires column saying why.

Its design thesis: **the claim and its receipt in the same frame.** The product's one
uncopyable property is that domains are composed at runtime from separate origins;
every other screen can only assert that. The `resolved` state is the detail that earns
it — it means the entry was fetched at boot but the code has not loaded yet, so lazy
federation is legible at rest instead of only when something fails. Its meaning is written
under the registry at every width, because the badge's `title` never reaches a phone.

A failed remote is called `unavailable` everywhere it is reported: this table, the nav and
the boundary's heading, matching the `remote.unavailable` audit row. `down` is the code's
name for that state and is not shown.

Every remote is listed before sign-in, including ones the visitor may not open. That
is not a leak: the registry is fetched before authentication and publishes every
`requiredRole`, because the shell builds its router from it.

### Signature Component — the Unavailable Boundary

The shell-owned screen for a remote that would not load, and the component where this
system's point of view is clearest. It is a full screen, not a toast: headline plus a
status badge, a `max-w-prose` explanation, then a `8rem 1fr` definition grid of exactly
what is known — attempts, failure class, the origin it was fetched from, and the raw
error in mono. Below that, a
`role="status"` line counting down an automatic retry (3 attempts at 1s/2s/4s), then
**Retry** as primary with **Reload page** offered only when the failure class actually
requires it, and a quiet underlined link back to the overview.

Its design thesis: **show the operator what you know.** No apologetic illustration, no
"something went wrong" — the attempt count, the failure class, the origin and the literal
error, because the audience for a failure is someone who has to decide what to do next.

It is for someone who may enter that domain. A session ending here leaves for the Overview
rather than retrying a route that would now decline them.

### Named Rules

**The Colour on Movement Rule.** Hover and active states change colour. They do not
move, scale, lift or shadow. `transition-colors` is the system's entire motion
vocabulary and there is no duration or easing token — adding one is a deliberate
decision, not a component-level convenience.

One exception, and it is not stylistic: `transition-colors` also transitions
`outline-color`, which must never animate. The focus rule clears its
`transition-property` for exactly that reason.

**The Undo Over Confirm Rule.** A reversible action is acknowledged and offers Undo; it
does not ask first. Only an action that would remove the ability to undo it — losing
your own access, or the platform's last administrator — is refused outright, and a
refusal always says why, in visible text at the control.

One exception: a flag whose data carries a `blastRadius`. Undo answers a mistake only the
operator has seen, and this one reaches other people the moment it flips. It takes a second
step, inline in the row and never a dialog: the consequence in words, focus on the choice
that changes nothing, a Danger button naming the action, Escape to back out. Undo is still
offered afterwards. Which flags qualify is decided in the data, not the template.

**The Silent Success Rule.** No write completes without saying so. A label flipping is
not feedback: it is invisible to a screen reader, and it is invisible to anyone whose
eyes were on the control they clicked rather than on a counter at the far corner of the
screen.

**The Focus Ring Rule.** One ring, declared once, for everything: a 2px solid
outline in the semantic `text` colour at `outline-offset: 2px`, from
`libs/shared/ui/src/focus-visible.css`, imported by all four apps **and** by
Storybook. Never per component.

Three parts of it are load-bearing, and each was a measured failure before it was a
rule:

- **`text`, not a focus token.** `text` is by definition legible against anything
  this system paints, so the ring clears 1.4.11's 3:1 against every surface that
  exists (17.06:1 on `bg`, 17.85:1 on `surface` in light; 15.27:1 and 14.07:1 in
  dark) *and* against any surface added later — a surface that failed against `text`
  could not carry text. A dedicated token would need re-verifying by hand each time.
  It also keeps focus off Control Indigo, which The Rationed Colour Rule reserves;
  indigo would have failed anyway, at 1.00:1 on a primary button's own fill and
  2.99:1 on the dark page.
- **The 2px offset.** Backgrounds paint only inside the border box, so the gap shows
  the *parent's* background, never the control's fill. That is what lets one colour
  serve every control. Remove the offset and the ring sits on the indigo and red
  fills at 2.84:1 and 3.70:1 — the indigo case fails.
- **It does not animate.** Tailwind's `transition-colors` includes `outline-color`,
  so without `transition-property: none` the ring fades in over 150ms from each
  control's own `currentColor` — white on the primary button. The indicator must be
  right on the frame focus arrives.

Never write `outline: none`. Declaring `outline-color` replaces the user agent ring
on its own, and `outline: none` is the one edit that can remove focus indication
outright — including the ring forced-colors mode synthesises.

## Do's and Don'ts

### Do

- **Do** read semantic colour tokens only — `bg`, `surface`, `text`, `text-muted`,
  `border`, `border-strong`, `on-*`. They are what make a component correct in both
  themes.
- **Do** use `border-strong` for a control's boundary and `border` for content
  separation. A control outlined only in `border` fails WCAG 1.4.11 and an e2e suite
  measures it.
- **Do** pair every status tint with its `on-*` ink.
- **Do** edit `libs/shared/design-tokens/tokens/*.json` to change a token, then
  regenerate. The committed CSS is generated and `tokens:check` fails on drift —
  hand-editing it is a gate failure, not a shortcut.
- **Do** keep `p-6` on every routed screen and the title-left / badges-right header
  row. Cross-remote alignment is federation's one visual promise.
- **Do** default to the `0.875rem` working size and `0.5rem` radius.
- **Do** prefer `aria-busy` to `disabled` for an action just triggered.
- **Do** put anything a second surface needs into `libs/shared/ui`. Drift between
  independently deployed remotes is this architecture's defining failure mode.
- **Do** verify both themes for every change. A component that passes light and fails
  dark fails.
- **Do** draw a new icon into the shared set at the same 1.5 stroke weight on the
  20px grid, in `currentColor`, and give the manifest its name.
- **Do** report identity problems in the shell notice, not only in the console.
- **Do** check the demo before the user when rendering identity. A demo visitor has a
  `user`, and must still never look signed in.
- **Do** acknowledge every write in the screen's action status, and offer Undo unless
  the action is one of the refusals.
- **Do** leave focus to the shared ring. It already covers `<button>`, `<a>`,
  `<input>`, `[tabindex]` holders and anything added later.

### Don't

- **Don't** add a `box-shadow` to a single component. The system has no elevation
  vocabulary; an improvised value becomes the de facto system without anyone choosing
  it. Design it deliberately, once.
- **Don't** introduce a webfont. Native system type is a committed decision.
- **Don't** reach past a semantic token to a `light-*` or `dark-*` value.
- **Don't** spend Control Indigo on anything that is not the primary action or the
  active route. Its rarity is what makes it readable.
- **Don't** use a status hue as text on its own tint, or a status colour to set a mood.
- **Don't** animate geometry. Colour transitions only — no transform, lift or scale.
- **Don't** add a confirmation dialog to a reversible action. A flag marked with a blast
  radius gets the inline second step instead.
- **Don't** put a refusal or lock reason only in a `title`.
- **Don't** let a write complete silently, or signal it only by a control changing.
- **Don't** write `outline: none`, anywhere, for any reason. It is the single edit
  that can remove focus indication outright.
- **Don't** add a focus utility to a component. The shared ring covers it; a local
  one would fragment the only indicator a keyboard user has.
- **Don't** let `outline-color` transition. `transition-colors` includes it, and an
  indicator that fades in is not an indicator on the frame it is needed.
- **Don't** make a badge interactive, or give a button a pill radius. The shapes are
  how an operator tells a report from a control.
- **Don't** remove or disable the navigation item for a failed remote. It is the route
  back in.
- **Don't** reach for an emoji, a Unicode glyph, or an icon font. The set is drawn;
  a glyph is a different weight, a different colour, and a different shape on every
  operating system.
- **Don't** give an icon its own colour. `currentColor` is what keeps it inside the
  colour ration.
- **Don't** adopt `brand-accent`, `rounded-sm`, `rounded-lg` or the `spacing` scale by
  accident. They are declared but unconsumed; adopting one is a system decision, and
  the honest alternatives are adopt deliberately or delete.
