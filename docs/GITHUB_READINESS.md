# GitHub profile preparation — 13 October 2026

## Main caption / repository About description

Compare Android builds, catch mismatches in privacy declarations and reviewer journeys, and generate verifiable release evidence.

## Short profile entry

**[Attest](https://github.com/AminSS99/Attest)** — An open-source Android release-checking CLI. Compare APK/AAB builds with privacy declarations and human-guided reviewer journeys, then generate a Release Passport and an offline-verifiable Evidence Capsule.

## Readiness

Ready for developer evaluation as an early open-source preview. Source installation is available; npm publication, hosted history, and iOS inspection are not available. The website is local-only until deployed.

Local checks on the current source: 73 tests pass; synthetic demo goes from HOLD to SHIP; both Capsules verify (14 and 15 files); Action smoke passes; website build passes. A clean source snapshot also passed `npm ci`, tests, demo, Capsule verification, and website build without existing dependencies or generated files.

Public main's latest observed hosted CI run passed all five jobs: [36121618480](https://github.com/AminSS99/Attest/actions/runs/36121618480). Its inputs were synthetic. New README, branding, and website changes require their own CI run before merging.

## Claims to use

- Android APK/AAB comparison; local analysis without source code.
- Evidence-backed declaration checks and human-guided reviewer journeys.
- Release Passport, recorded human decisions, exceptions, and offline Capsule integrity verification.
- Reusable GitHub Action, tested on synthetic hosted-runner inputs.

## Next proof

One authorized real Android release, followed by repeat usage. No real design-partner release, measured customer outcome, automated store approval, or compliance certification is claimed. Follow [PILOT_INTAKE.md](PILOT_INTAKE.md).
