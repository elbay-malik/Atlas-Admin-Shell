# ADR-0000: Record architecture decisions as MADR-style ADRs

- Status: accepted
- Date: 2026-07-08
- Deciders: Elbay Malik

## Context and Problem Statement

This repository's primary deliverable is architectural judgment. Decisions and their rejected
alternatives must be legible to a reviewer years later, including the facts they rested on at the
time — which, in a fast-moving ecosystem, go stale within months.

## Decision Outcome

Adopt lightweight MADR-style ADRs in `docs/adr/`, numbered `NNNN`, one decision per file, using
[template.md](template.md). Two house rules:

1. Every ADR carries a **Verification** section with *dated receipts* — the npm peer ranges,
   dist-tags, GitHub issue states, or documentation checked, and when. A claim without a receipt
   is an opinion.
2. ADRs are immutable once accepted; a change of mind produces a new ADR that supersedes the old
   one (`Status: superseded by ADR-XXXX`).

### Consequences

- Positive: decisions survive ecosystem drift; the README's "Key decisions" table stays honest.
- Negative: small writing overhead per decision.

## Verification

Not applicable (meta-decision).

## References

- [MADR](https://adr.github.io/madr/)
