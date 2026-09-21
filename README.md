# Attest

> **Prove your mobile release matches its promises.**

Attest shows exactly what changed in your mobile release, which declarations and reviewer materials are now outdated, and the evidence needed to ship confidently. It is built around one durable object — the **Release Passport** — a versioned, evidence-backed record connecting a build to its store declarations, privacy claims, exceptions, owners, and the final release decision.

Attest is not legal advice and never promises store approval. It produces traceable technical evidence, detects contradictions, and lets a human make the call.

## What's here

This monorepo is the **open-source core** (Apache-2.0, see `PRODUCT_PLAN.md` §12):

| Package | Purpose |
| --- | --- |
| `packages/schema` | Open schemas: BuildFacts, ReleaseDiff, DataSafetyDeclaration, Finding, Claim, ReleasePassport, Journey, PolicyPack, EvidenceCapsule |
| `packages/cli` | Local engine: AAB/APK inspection, two-build diff, five truth-gap rules, SARIF, HTML Release Passport, Evidence Capsule + offline verifier |

Zero runtime dependencies. The ZIP reader, binary-manifest (AXML) parser, and DEX string scanner are implemented from the format specs — fully auditable, nothing leaves your machine.

## Quickstart

```bash
npm install
npm run build
npm test          # 31 tests, including the end-to-end pipeline
npm run demo      # the MVP signature: new SDK → new permission + destination → truth gaps → Passport
```

Then on your own artifacts:

```bash
attest inspect app-release.apk --out facts.json
attest diff last-week.apk candidate.apk --out diff.json
attest check --base last-week.apk --candidate candidate.apk \
  --data-safety data-safety.json --privacy-policy privacy.txt --listing listing.txt
attest passport --base last-week.apk --candidate candidate.apk \
  --data-safety data-safety.json --out evidence/
attest verify evidence/        # offline tamper check
```

`attest check` and `attest passport` exit with code `2` when confirmed contradictions exist (CI-gateable), `0` otherwise.

## The five truth-gap rules

| Rule | Fires when |
| --- | --- |
| **TG-001** | A new dangerous permission appears whose mapped data type is absent from the Data Safety form |
| **TG-002** | A new third-party SDK is in the build but disclosed in neither Data Safety nor the privacy policy |
| **TG-003** | A new network destination host is embedded in the build and disclosed nowhere |
| **TG-004** | The Data Safety form declares a data type with no supporting build evidence in either build |
| **TG-005** | A permission was removed, but the Data Safety form still declares its data type (stale store surface) |

Every finding cites its sources with an **evidence class** (`observed` / `declared` / `attested` / `inferred` / `missing`), the exact comparison that triggered it, and a deterministic reason. Findings are content-addressed: same inputs, same IDs, no churn.

## Evidence Capsule

`attest passport` seals an Evidence Capsule: passport (HTML + JSON), diff, findings (+ SARIF), declaration snapshots, and a manifest with a SHA-256 over every file plus an evidence root hash. `attest verify` re-checks it offline — it proves what evidence existed and what decision was made, without an Attest subscription, and without certifying compliance.

## Security principles (inherited from the plan)

- Local analysis is the default; source code is never required.
- Evidence exports redact secrets and personal data.
- Credentials never appear in journeys, passports, or capsules — only expiring references.
- AI (when added to hosted surfaces) may summarize evidence but can never invent runtime facts, mark a release compliant, or approve exceptions.

## Roadmap mapping

- ✅ **Weeks 1–2**: schemas, AAB/APK inspector, deterministic diff, local CLI, JSON output
- ✅ **Weeks 3–4**: Data Safety JSON/CSV import, privacy-policy/listing import, first Truth Graph relationships, five truth-gap rules
- ✅ **Weeks 5–6 (partial)**: HTML Release Passport + Evidence Capsule manifest
- 🔜 Human-guided Reviewer Twin recorder, GitHub Action packaging, hosted history

## CI

See `examples/github-action.yml` for a pull-request gate that uploads SARIF to GitHub code scanning.
