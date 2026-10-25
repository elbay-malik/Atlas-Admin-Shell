# shell-bff

The edge backend-for-frontend: a Cloudflare Worker that serves `/api/*` on the shell's own origin,
alongside the shell's static assets.

It exists because `AtlasAuth.hasRole()` gates **navigation** in the browser, which is UX, not
security — `canMatch` stops a download, not a `curl`. This is where authorization is actually
enforced: every route verifies a signed token and re-derives the caller's role server-side from the
same rule the browser uses (`toAtlasRole` in `@atlas/shared-contracts`).

## Running the tests

`nx test shell-bff` runs the suite inside real workerd via `@cloudflare/vitest-plugin`, using
`wrangler.test.jsonc` so it never depends on a built `dist/`. The JWT tests generate their own RS256
key pair, so the crypto path is genuinely exercised with no identity provider. The test JWKS also
publishes an ES256 key on purpose: the algorithm-confusion test signs with it and expects the RS256
pin to refuse the token, which a probe signed with an unpublished key could not prove.
