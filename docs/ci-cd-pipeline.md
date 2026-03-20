# CI/CD Pipeline Guide

## Overview

GSD uses a simple CI/CD setup: required PR checks for merge safety, and an explicit release workflow for publishing.

```
Contributors open PRs
        │
        ▼
   ┌──────────┐    checks.yml: build, test, typecheck, security scan
   │  CHECKS  │    required for merge — runs on every PR and push to main
   └────┬─────┘
        ▼
   Maintainer squash-merges when ready
        │
        ▼ (explicit workflow_dispatch)
   ┌──────────┐    release.yml: build, smoke test, publish, tag, GitHub Release
   │ RELEASE  │    one workflow owns all stable publishing
   └──────────┘
```

Releases are explicit maintainer decisions, not side effects of merging code. You can merge ten PRs and ship once when ready.

## For Contributors

### Checking CI Status

Every PR runs `checks.yml` automatically. All jobs must pass before merge:

- Secret scan
- `.gsd/` directory guard
- Skill reference validation
- Linux: build, typecheck, unit tests, integration tests, package validation
- Windows: build, typecheck, unit tests

### Installing a Release

```bash
# Stable production release
npx gsd-pi@latest    # or just: npx gsd-pi

# Specific version
npx gsd-pi@2.37.0
```

### Using Docker

```bash
# Latest stable
docker run --rm -v $(pwd):/workspace ghcr.io/gsd-build/gsd-pi:latest --version

# Specific version
docker run --rm -v $(pwd):/workspace ghcr.io/gsd-build/gsd-pi:2.37.0 --version
```

## For Maintainers

### Workflows

| Workflow | File | Trigger | Required for merge |
|----------|------|---------|--------------------|
| Checks | `checks.yml` | `pull_request` + `push` to `main` | **Yes** |
| Release | `release.yml` | `workflow_dispatch` (manual) | No |
| Build Native | `build-native.yml` | `v*` tags + manual dispatch | No |
| Builder Image | `builder-image.yml` | Push to `main` (path-filtered) | No |
| AI Triage | `ai-triage.yml` | Issue/PR opened | No |

### Day-to-Day Loop

1. Contributors open PRs against `main`.
2. `checks.yml` runs and gives the merge decision.
3. Squash-merge PRs when checks are green and the change is ready.
4. When you want to ship, go to Actions → Release → Run workflow.
5. Choose the bump type (`auto` detects from conventional commits, or override with `patch`/`minor`/`major`).
6. The release workflow builds, tests, publishes to npm, creates a GitHub Release, pushes Docker images, and posts to Discord.

### Releasing

Go to **Actions → Release → Run workflow** and choose:

- **bump**: `auto` (recommended) lets `generate-changelog.mjs` determine the bump type from conventional commits. Override with `patch`, `minor`, or `major` if needed.
- **dry-run**: `true` to run the full build and test pipeline without publishing or pushing. Use this to verify a release will succeed before committing to it.

The release workflow:
1. Generates changelog from conventional commits since the last stable tag
2. Bumps version in all package.json files
3. Updates CHANGELOG.md
4. Builds and runs smoke tests
5. Commits with `[skip ci]` to prevent re-triggering checks
6. Tags and pushes
7. Publishes to npm with `--provenance`
8. Creates GitHub Release
9. Builds and pushes Docker runtime image
10. Posts to Discord (if webhook is configured)

### Native Binaries

`build-native.yml` triggers on `v*` tags (created by the release workflow) and publishes platform-specific `@gsd-build/engine-*` packages. It does **not** publish the main `gsd-pi` package — that's exclusively owned by `release.yml`.

The native binary matrix covers:
- `darwin-arm64` (Apple Silicon)
- `darwin-x64` (Intel Mac)
- `linux-x64-gnu`
- `linux-arm64-gnu`
- `win32-x64-msvc`

### Rolling Back a Release

```bash
# Roll back npm to a previous version
npm dist-tag add gsd-pi@<previous-good-version> latest

# Roll back Docker
docker pull ghcr.io/gsd-build/gsd-pi:<previous-good-version>
docker tag ghcr.io/gsd-build/gsd-pi:<previous-good-version> ghcr.io/gsd-build/gsd-pi:latest
docker push ghcr.io/gsd-build/gsd-pi:latest
```

### GitHub Configuration Required

| Setting | Value |
|---------|-------|
| Required status check | `Checks` workflow (all jobs) |
| Environment: `prod` | Required reviewers: maintainers |
| Secret: `NPM_TOKEN` | `prod` environment |
| Secret: `RELEASE_PAT` | `prod` environment (PAT with `contents: write` for pushing release commits) |
| Secret: `ANTHROPIC_API_KEY` | `prod` environment (for AI triage) |
| Secret: `DISCORD_CHANGELOG_WEBHOOK` | `prod` environment (optional) |
| GHCR | Enabled for the `gsd-build` org |

### Branch Protection

Recommended settings:

- Squash merge only
- Require `Checks` workflow to pass
- Require conversation resolution before merge
- Require branch to be up to date before merge (optional — enable if merge conflicts are frequent)

### Docker Images

| Image | Base | Purpose | Tags |
|-------|------|---------|------|
| `ghcr.io/gsd-build/gsd-ci-builder` | `node:24-bookworm` | CI build environment with Rust toolchain | `:latest` |
| `ghcr.io/gsd-build/gsd-pi` | `node:24-slim` | User-facing runtime | `:latest`, `:<version>` |

The builder image is rebuilt automatically only when `Dockerfile` changes (path-triggered workflow).

## LLM Fixture Tests

The fixture system records and replays LLM conversations without hitting real APIs (zero cost).

### Running Fixture Tests

```bash
npm run test:fixtures
```

### Recording New Fixtures

```bash
GSD_FIXTURE_MODE=record GSD_FIXTURE_DIR=./tests/fixtures/recordings \
  node --experimental-strip-types tests/fixtures/record.ts
```

Fixtures are JSON files in `tests/fixtures/recordings/`. Each captures a conversation's request/response pairs and replays them by turn index.

### When to Re-Record

Re-record fixtures when:
- Provider wire format changes (e.g., new field in Anthropic response)
- Tool definitions change (affects request shape)
- System prompt changes (may cause turn count mismatch)
