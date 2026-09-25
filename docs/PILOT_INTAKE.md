# Attest Pilot Intake — what the owning team provides

Status: **no real pilot inputs have been received.** The pilot run is stopped
until the items below arrive. Demo figures from the synthetic PulseFit
fixtures must not be quoted as pilot results.

## Required (all five)

1. **Last-shipped base binary** — the exact AAB/APK from the Play Console
   previous release (file + versionName/versionCode).
2. **Release-candidate binary** — the current `assembleRelease` AAB/APK
   (file + versionName/versionCode).
3. **Current Data Safety answers** — Play Console export converted to
   `attest.data-safety/1` JSON (or the `kind,value,details` CSV);
   `attest init` creates the template.
4. **Privacy-policy text** — current policy as plain UTF-8.
5. **Store listing** — current Play title + description as plain UTF-8.

## Optional (recommended)

6. **Reviewer journey + device** — one recorded Reviewer Twin journey
   (`attest journey record` over ADB) or an emulator/device with the
   candidate installed plus a credential **reference** (vault label + expiry
   only — never the secret).

## How to deliver

- Place files on the pilot machine or a shared pilot folder the Attest
  operator can read; confirm the project authorizes their use for this pilot.
- Binaries and declarations stay local: only the filled
  `docs/PILOT_SCORECARD.md` block comes back — never APKs, policy contents,
  screenshots, account references, or credentials.

## What happens next

1. Operator runs `init → doctor → check → passport → verify` (+ Reviewer
   Twin if a device is provided) and records results in `PILOT_SCORECARD.md`
   under the matching team block, clearly separated from demo observations.
2. Only issues actually uncovered by that run get fixed; no new features.
3. No claim of five pilots, repeat usage, or a GitHub-hosted Action run is
   made until those events occur.
