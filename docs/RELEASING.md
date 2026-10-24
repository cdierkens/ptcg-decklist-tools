# Releasing

A release is a **tag push**. CI publishes with npm trusted publishing, so the
upload has provenance and there is no long-lived npm token in the repository.
The workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml).

```
changeset  →  pnpm run version  →  commit  →  git tag  →  git push --tags
                                                              ↓
                         CI: guards → verify → npm publish (OIDC)
```

The dist-tag is derived from the version: anything with a prerelease suffix
(`1.0.0-rc.1`) goes to `next`; everything else moves `latest`.

## One-time setup

The package name already exists on npm (the `0.0.0-stage` placeholder). To let
CI publish it:

1. Open the package access settings on npmjs.com and add a **GitHub Actions**
   trusted publisher with:
   - repository `cdierkens/ptcg-decklist-tools`
   - workflow filename `release.yml`
   - environment `npm`
   - **Allow npm publish** ticked (configurations created after 2026-09-03
     default to stage-only, which would require a per-release approval on
     npmjs.com)
2. The `npm` GitHub environment must exist and have a required reviewer. The
   publish job waits for that approval; the tag alone cannot publish.
3. Complete a publish within **2 days** of creating the trusted publisher, or
   the configuration expires and must be recreated.

## Routine release

```sh
pnpm changeset           # describe the change
pnpm run version         # applies changesets → package.json + CHANGELOG.md
pnpm run verify          # the full gate
git add -A && git commit -m "chore: release vX.Y.Z"
git tag vX.Y.Z && git push origin main --tags
```

The tag must match `package.json` and be an ancestor of `main`; the workflow
checks both before publishing. `prepublishOnly` runs the same gate again on the
runner. Approve the `npm` environment deployment when GitHub asks.

Do not publish locally. The first `0.1.0` was a manual exception to create the
package; every later release uses the tag path.

## Gotchas

- **Never set `registry-url:`** on the publish job's `setup-node`. It writes an
  empty `_authToken` line, npm treats auth as already configured, and the OIDC
  exchange never starts.
- **`--provenance` is unnecessary.** Trusted publishing attaches the
  attestation automatically.
- **The npm CLI must be >= 11.5.1.** Node 22 bundles npm 10.x, so the workflow
  installs npm explicitly.
- **No `--no-git-checks`.** npm has no detached-HEAD publish check.
