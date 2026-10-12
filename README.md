# Attest

<img src="apps/web/attest-logo.png" alt="Attest mark" width="56" />

**Compare Android builds, catch mismatches in privacy declarations and reviewer journeys, and generate verifiable release evidence.**

Attest compares the last shipped Android build with a release candidate. It checks whether the build, privacy declarations, and reviewer journey still agree, then creates an evidence-backed **Release Passport** with a `SHIP`, `REVIEW`, or `HOLD` recommendation. A person makes the final decision. The **Evidence Capsule** keeps the record verifiable offline.

> A *truth gap* is a mismatch between what the build shows and what the release materials say, or a claim that lacks supporting evidence.

## Quickstart

Requires Node.js 20 or later. The CLI is available from this repository; it is **not published to npm**.

```bash
git clone https://github.com/AminSS99/Attest.git
cd Attest
npm ci
npm run demo
```

The synthetic PulseFit demo creates a `HOLD` release and a repaired `SHIP` release. Open `attest-out/demo/capsule/passport.html` to read the first Passport, then verify its Capsule:

```bash
npm run attest -- verify attest-out/demo/capsule
```

PulseFit is a demonstration, not a customer release.

## Use it on your release

Bring the last shipped APK/AAB, the candidate APK/AAB, and your current Data Safety answers. Privacy-policy text, listing copy, and a Reviewer Twin journey add more context. Run Attest locally; source code is not required.

```bash
npm run build
npm run attest -- check \
  --base path/to/last-shipped.apk \
  --candidate path/to/candidate.apk \
  --data-safety path/to/data-safety.json \
  --privacy-policy path/to/privacy.txt \
  --listing path/to/listing.txt
npm run attest -- passport \
  --base path/to/last-shipped.apk \
  --candidate path/to/candidate.apk \
  --data-safety path/to/data-safety.json \
  --out path/to/evidence/
npm run attest -- verify path/to/evidence/
```

Run these from the Attest checkout and replace `path/to/...` with files you control; keep private builds outside this repository. For guided setup in your app folder, run `npm run attest -- init --dir path/to/app`, fill its templates, then run `npm run attest -- doctor --dir path/to/app`. A fresh template intentionally fails `doctor` until its inputs exist. A `HOLD` result uses exit code `2` so CI can gate a release. For human-guided Reviewer Twin recording, decisions, and exceptions, see the [pilot kit](docs/DESIGN_PARTNER_PILOT.md). Run `npm run attest -- help` for every command.

## What is available

See [GitHub profile copy and readiness evidence](docs/GITHUB_READINESS.md) for the current preparation snapshot.

| Surface | Today |
| --- | --- |
| **CLI** | Android APK/AAB inspection, two-build diff, five truth-gap rules, human-guided Reviewer Twin, Passports, exceptions, decisions, and offline Capsule verification |
| **GitHub Action** | Reusable CI check with a release summary, SARIF, and evidence artifacts; [validated on hosted runners](docs/HOSTED_ACTION_RUN.md) with synthetic fixtures |
| **Website** | Public-facing static site and guide in `apps/web`; local preview only |

There is no iOS inspector, hosted dashboard, macOS app, published npm package, or fully automated device journey yet. Attest does not guarantee store approval. No real design-partner release has been measured yet.

## Website and development

```bash
npm run web:dev       # http://127.0.0.1:4173
npm run web:build     # apps/web/dist/
npm test              # CLI build and tests
```

The website uses HTML, CSS, and a small JavaScript reveal effect. The CLI and schemas are TypeScript. They live in one repository but have separate build commands.

## Project map

| Path | Purpose |
| --- | --- |
| [`packages/cli`](packages/cli) | Local inspection, rules, journeys, Passport, and Capsule |
| [`packages/schema`](packages/schema) | Versioned evidence and release schemas |
| [`apps/web`](apps/web) | Website and local guide |
| [`.github/actions/attest`](.github/actions/attest) | Reusable GitHub Action |
| [`docs`](docs) | Pilot intake, scorecard, and validation records |
| [`PRODUCT_PLAN.md`](PRODUCT_PLAN.md) | Product direction and the next AI-ready work plan |

**Next milestone:** run Attest on a real Android release with an authorized design partner; record setup time, useful findings, misses, and the team's decision. Start with the [pilot intake checklist](docs/PILOT_INTAKE.md).

Apache-2.0 licensed. Evidence supports a human release decision; it is not legal advice or a compliance certification.
