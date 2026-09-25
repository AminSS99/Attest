# Internal Dry Run — 25 September 2026 (honest record)

Environment: macOS local, Node v22.22.3, npm 10.9.8. Attest at commit
`b24f7a2` (Weeks 7–8 checkpoint, unpushed).

## What this was

A **synthetic distribution rehearsal only** — tarball install plus the
bundled PulseFit demo fixtures from a clean external directory. It is
**not** a real pilot result and must never be quoted as one. No real
application build was involved.

## Exact steps and exit codes (all local)

From the Attest repo:

- `npm run build` → OK
- `npm pack --workspace attest-schema --pack-destination /tmp` → `attest-schema-0.1.0.tgz`
- `npm pack --workspace attest-cli --pack-destination /tmp` → `attest-cli-0.1.0.tgz`

From clean external dir `/tmp/pilot-external` (no Attest checkout):

- `npm init -y` + `npm install /tmp/attest-schema-0.1.0.tgz /tmp/attest-cli-0.1.0.tgz` → OK (2 packages)
- `./node_modules/.bin/attest --help` → exit 0
- `attest init --dir /tmp/pilot-external` → exit 0, 8 files, no secrets
- `attest doctor --dir /tmp/pilot-external` on empty templates → exit 1 (missing `artifacts/base.apk`, `artifacts/candidate.apk`, adb absent with Twin configured — all expected, actionable)
- `attest check` on demo fixtures → exit 2 (2 confirmed contradictions + 3 review items, delta `+1 perms, -1 perms, +1 SDKs, +1 destinations, +1 exported components`)
- `attest passport … --out /tmp/pilot-external/capsule` → exit 2, HOLD, 8 files sealed
- `attest verify /tmp/pilot-external/capsule` → exit 0 (`Capsule OK — 8 files verified`)
- `attest exception accept` (TG-002 finding, owner/approver/reason/expiry) → success, rec stays HOLD; `verify` → exit 0
- `attest decide --status ship --reason …` → `STATUS:ship`, rec unchanged HOLD, `REV:0`

## Real-build search (local)

Searched `~/Dev` for real Android inputs:

- `*.apk` / `*.aab`: only `attest-out/demo/pulsefit-1.2.0.apk` + `pulsefit-1.3.0.apk` (synthetic fixtures)
- `gradlew`: none
- `AndroidManifest.xml`: none (nearest mobile code is an Expo/React Native web project with no built binary)

**Conclusion: no suitable real base build + release candidate exists locally,
and no project authorized their use. No Attest run on a real build has
happened.**

## Exact inputs needed for the first real pilot

See `docs/PILOT_INTAKE.md` (one-page owning-team checklist). In short, per
team, all authorized by the owning project (binaries stay on the pilot
machine; only `PILOT_SCORECARD.md` comes back):

1. Last-shipped base AAB/APK (Play Console, previous release).
2. Release-candidate AAB/APK (`assembleRelease` output).
3. Data Safety answers as `attest.data-safety/1` JSON (or the `kind,value,details` CSV).
4. Current privacy-policy text (plain UTF-8).
5. Current Play listing copy (plain UTF-8).
6. (Recommended) One recorded reviewer journey + ADB-capable emulator/device and a credential **reference** (label + expiry, never the secret).

## Still needs a real GitHub-hosted runner

- The composite Action (`.github/actions/attest`) has passed only the local
  simulation `scripts/smoke-action.sh` plus the vendoring checks in this dry
  run. It has **never** run on GitHub-hosted runners — first hosted run is an
  experiment (see `DESIGN_PARTNER_PILOT.md` §4).
- `actionlint` remains advisory-only and is not installed here.
