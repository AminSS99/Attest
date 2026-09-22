# Attest

> **Prove your mobile release matches its promises.**

Attest shows exactly what changed in your mobile release, which declarations and reviewer materials are now outdated, and the evidence needed to ship confidently. It is built around one durable object — the **Release Passport** — a versioned, evidence-backed record connecting a build to its store declarations, privacy claims, exceptions, owners, and the final release decision.

Attest is not legal advice and never promises store approval. It produces traceable technical evidence, detects contradictions, and lets a human make the call.

## What's here

This monorepo is the **open-source core** (Apache-2.0, see `PRODUCT_PLAN.md` §12):

| Package | Purpose |
| --- | --- |
| `packages/schema` | Open schemas: BuildFacts, ReleaseDiff, DataSafetyDeclaration, Finding, Claim, ReleasePassport, Journey, JourneyComparison, PolicyPack, EvidenceCapsule |
| `packages/cli` | Local engine: AAB/APK inspection, two-build diff, five truth-gap rules, Reviewer Twin journey recorder/compare, SARIF, HTML Release Passport, Evidence Capsule + offline verifier |

Zero runtime dependencies. The ZIP reader, binary-manifest (AXML) parser, and DEX string scanner are implemented from the format specs — fully auditable, nothing leaves your machine. Journeys are recorded human-guided over ADB: you perform each step, Attest captures the screenshot, activity, expected/observed state, and status.

## Quickstart

```bash
npm install
npm run build
npm test          # 51 tests, including the Reviewer Twin end-to-end pipeline
npm run demo      # the MVP signature: truth gaps + failed reviewer journey → HOLD, repair → SHIP
```

Then on your own artifacts:

```bash
attest inspect app-release.apk --out facts.json
attest diff last-week.apk candidate.apk --out diff.json
attest check --base last-week.apk --candidate candidate.apk \
  --data-safety data-safety.json --privacy-policy privacy.txt --listing listing.txt

# Reviewer Twin: human-guided journey recording over ADB
attest journey record --device emulator-5554 --name reviewer-premium-ai \
  --title "Reviewer reaches premium AI feature" \
  --credential-label "reviewer account (vault ref)" --credential-expires 2027-01-15
attest journey compare --baseline journeys/reviewer-premium-ai-1.2.0.json \
  --candidate journeys/reviewer-premium-ai-1.3.0.json    # first changed/failed step
attest journey instructions --journey journeys/reviewer-premium-ai-1.3.0.json \
  --baseline journeys/reviewer-premium-ai-1.2.0.json --out instructions.html

attest passport --base last-week.apk --candidate candidate.apk \
  --data-safety data-safety.json \
  --journey journeys/reviewer-premium-ai-1.3.0.json --out evidence/
attest verify evidence/        # offline tamper check (journey screenshots included)
```

`attest check`, `attest journey compare`, and `attest passport` exit with code `2` when confirmed contradictions exist or the journey fails (CI-gateable), `0` otherwise.

## The five truth-gap rules

| Rule | Fires when |
| --- | --- |
| **TG-001** | A new dangerous permission appears whose mapped data type is absent from the Data Safety form |
| **TG-002** | A new third-party SDK is in the build but disclosed in neither Data Safety nor the privacy policy |
| **TG-003** | A new network destination host is embedded in the build and disclosed nowhere |
| **TG-004** | The Data Safety form declares a data type with no supporting build evidence in either build |
| **TG-005** | A permission was removed, but the Data Safety form still declares its data type (stale store surface) |

## The two journey rules

| Rule | Fires when |
| --- | --- |
| **JT-001** | A recorded reviewer journey fails, blocks, or is incomplete versus its expected visible states — a confirmed contradiction on the reviewer path |
| **JT-002** | The journey still passes, but an action or expected result changed since the approved baseline |

Every finding cites its sources with an **evidence class** (`observed` / `declared` / `attested` / `inferred` / `missing`), the exact comparison that triggered it, and a deterministic reason. Findings are content-addressed: same inputs, same IDs, no churn.

## Reviewer Twin

Attest rehearses the store review as a repeatable journey instead of another checklist:

- **`journey record`** — human-guided capture over ADB. You perform each step by hand; Attest records the exact instruction, expected visible result, observed result, foreground activity, timestamp, screenshot (hashed), and pass/fail/blocked status, plus device metadata.
- **`journey compare`** — diffs a re-run against the previously approved journey and identifies the **first changed step** and the **first failed step** (exit `2` on failure).
- **`journey instructions`** — self-contained reviewer instructions with exact steps and screenshots embedded for offline use.
- **`journey` findings in the Passport** — a failed or incomplete journey becomes a `JT-001` confirmed contradiction, so the Passport recommendation covers both declaration truth gaps and the reviewer path. Passing-but-edited journeys become `JT-002` review items.
- **Credential readiness** — journeys store only a credential *label* and expiry (`ready` / `expiring_soon` / `expired`). Secrets never enter journeys, Passports, or Capsules.

The Passport's **Reviewer Twin journeys** section shows the run result, the first changed and failed steps, every step with expected vs observed state, and screenshot hashes. The Capsule seals `journeys/<id>/journey.json`, `comparison.json`, and every screenshot — all covered by the evidence root hash and `attest verify`.

## Evidence Capsule

`attest passport` seals an Evidence Capsule: passport (HTML + JSON), diff, findings (+ SARIF), declaration snapshots, journey records with screenshots and baseline comparisons, and a manifest with a SHA-256 over every file plus an evidence root hash. `attest verify` re-checks it offline — it proves what evidence existed and what decision was made, without an Attest subscription, and without certifying compliance.

## Security principles (inherited from the plan)

- Local analysis is the default; source code is never required.
- Evidence exports redact secrets and personal data.
- Credentials never appear in journeys, passports, or capsules — only expiring references.
- AI (when added to hosted surfaces) may summarize evidence but can never invent runtime facts, mark a release compliant, or approve exceptions.

## Roadmap mapping

- ✅ **Weeks 1–2**: schemas, AAB/APK inspector, deterministic diff, local CLI, JSON output
- ✅ **Weeks 3–4**: Data Safety JSON/CSV import, privacy-policy/listing import, first Truth Graph relationships, five truth-gap rules
- ✅ **Weeks 5–6**: human-guided Reviewer Twin recorder (ADB), journey compare with first-failed-step detection, credential references + readiness, HTML Release Passport (with journey section), Evidence Capsule including journey evidence
- 🔜 Exception approval + final ship/hold record, reusable GitHub Action + PR summary, release history, five Android design-partner pilots

## CI

See `examples/github-action.yml` for a pull-request gate that uploads SARIF to GitHub code scanning.
