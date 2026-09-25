# Attest

> **Prove your mobile release matches its promises.**

Attest shows exactly what changed in your mobile release, which declarations and reviewer materials are now outdated, and the evidence needed to ship confidently. It is built around one durable object — the **Release Passport** — a versioned, evidence-backed record connecting a build to its store declarations, privacy claims, exceptions, owners, and the final release decision.

Attest is not legal advice and never promises store approval. It produces traceable technical evidence, detects contradictions, and lets a human make the call.

## Public website (local preview)

The public site lives in `apps/web`. It is static HTML and CSS, with no website runtime dependencies. It includes a responsive reading copy of the synthetic PulseFit Passport and the original sealed demo Capsule. No deployment is configured.

```bash
npm run web:dev       # open http://127.0.0.1:4173
npm run web:build     # writes apps/web/dist/
node apps/web/scripts/serve.mjs --built  # preview the built site on the same URL
```

The CLI build and test commands below remain independent of the website build.

## What's here

This monorepo is the **open-source core** (Apache-2.0, see `PRODUCT_PLAN.md` §12):

| Package | Purpose |
| --- | --- |
| `packages/schema` | Open schemas: BuildFacts, ReleaseDiff, DataSafetyDeclaration, Finding, Claim, ReleasePassport, ExceptionRecord, Journey, JourneyComparison, PolicyPack, EvidenceCapsule |
| `packages/cli` | Local engine: AAB/APK inspection, two-build diff, five truth-gap rules, Reviewer Twin journey recorder/compare, exceptions + human ship/hold decision, SARIF, HTML Release Passport, Evidence Capsule + offline verifier |

Zero runtime dependencies. The ZIP reader, binary-manifest (AXML) parser, and DEX string scanner are implemented from the format specs — fully auditable, nothing leaves your machine. Journeys are recorded human-guided over ADB: you perform each step, Attest captures the screenshot, activity, expected/observed state, and status.

## Quickstart

Clone the source (the CLI is not yet published to npm):

```bash
git clone https://github.com/AminSS99/Attest.git
cd Attest
npm ci
npm run build
export PATH="$PWD/node_modules/.bin:$PATH" # makes the local `attest` command available in this shell
npm test          # 73 tests, including Reviewer Twin, Release Decision Workflow, and onboarding e2e
npm run demo      # the MVP signature: truth gaps + failed reviewer journey → HOLD, repair → SHIP
./scripts/smoke-action.sh   # realistic GitHub Action smoke test (no runner needed)
```

To avoid changing `PATH`, call `node packages/cli/dist/src/cli.js` in place of
`attest` in the examples below.

Pilot onboarding (no hosted dashboard):

```bash
attest init                 # reviewable .attest/ workspace, no secrets
attest doctor               # blocking setup checks (exit 1 on FAIL)
```

See `docs/DESIGN_PARTNER_PILOT.md` for the five-team Android pilot kit
(installation, artifacts, Reviewer Twin, CI, evidence handling, scorecard).

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

# Exceptions overlay findings without erasing them; a human makes the final call
attest exception accept --passport evidence/passport.json --finding F-... \
  --owner "Mobile Platform" --reason "Temporary migration window" \
  --expires 2026-10-15 --approved-by "Release Lead"
attest decide --passport evidence/passport.json --status ship \
  --decided-by "Release Lead" --reason "Reviewed remaining evidence" \
  --out evidence/approved-passport.json   # ship over HOLD requires --reason
attest verify evidence/        # exceptions + decision are sealed in the capsule
```

`attest check`, `attest journey compare`, `attest passport`, and `attest decide` exit with code `2` when confirmed contradictions exist, the journey fails, or the human decision is hold (CI-gateable), `0` otherwise. Usage/runtime errors exit `1`.

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

## Release Decision Workflow

The Passport recommends (`SHIP` / `REVIEW` / `HOLD`); a human decides. The decision workflow keeps both sides honest:

- **`exception accept`** — approve a time-boxed exception for a specific finding id, bound to the candidate artifact hash, with owner, rationale, approver, approval time, and expiry. Findings are never rewritten: exceptions overlay evidence, and Attest's recommendation is unchanged by exceptions.
- **`decide`** — record the final human `ship` or `hold`. Shipping over a `HOLD` (or `REVIEW`) recommendation is an explicit override and requires `--reason`. The Passport shows `Attest recommendation`, `Human decision`, `Override approved by`, `Reason`, and `Exception expires` in human-readable dates.
- **Immutability** — a finalized decision cannot be rewritten in place. Corrections write a new Passport revision (`revision++`, `supersedes`) to a new file; the original stays byte-identical.
- **Sealed evidence** — exceptions and the decision live inside the Evidence Capsule. `attest verify` recomputes every file hash, the evidence root, and the Passport's content-addressed id — any post-decision modification fails offline verification.
- **`seal`** — seal a standalone Passport into a capsule, or reseal from an existing capsule (`--from`).

## Evidence Capsule

`attest passport` seals an Evidence Capsule: passport (HTML + JSON), diff, findings (+ SARIF), declaration snapshots, journey records with screenshots and baseline comparisons, approved exceptions, the final human decision, and a manifest with a SHA-256 over every file plus an evidence root hash. `attest verify` re-checks it offline — every file hash, the evidence root, and the Passport's content-addressed id — proving what evidence existed and what decision was made, without an Attest subscription, and without certifying compliance.

## Security principles (inherited from the plan)

- Local analysis is the default; source code is never required.
- Evidence exports redact secrets and personal data.
- Credentials never appear in journeys, passports, or capsules — only expiring references.
- Exceptions require a named owner and approver, bind to a finding + artifact hash, and expire; they never rewrite findings.
- A human decides ship/hold; overrides require an explicit reason. Finalized decisions are immutable.
- The GitHub Action publishes no PR comments and uploads screenshots/declaration contents only as workflow artifacts, never into step summaries or PR threads.
- AI (when added to hosted surfaces) may summarize evidence but can never invent runtime facts, mark a release compliant, or approve exceptions.

## Onboarding

- **`init`** — scaffolds a reviewable `.attest/` workspace: `config.json`, declaration templates, journeys directories, output guidance (`attest-out/`, gitignored), and a sample GitHub workflow. No secrets are created.
- **`doctor`** — checks Node ≥ 20, ADB presence when Reviewer Twin is configured, artifact/declaration paths, journey parsing, credential expiry, output writability, and accidental secret values. Prints `PASS`/`WARN`/`FAIL` with actionable hints; exits `1` on blocking errors.

## Roadmap mapping

- ✅ **Weeks 1–2**: schemas, AAB/APK inspector, deterministic diff, local CLI, JSON output
- ✅ **Weeks 3–4**: Data Safety JSON/CSV import, privacy-policy/listing import, first Truth Graph relationships, five truth-gap rules
- ✅ **Weeks 5–6**: human-guided Reviewer Twin recorder (ADB), journey compare with first-failed-step detection, credential references + readiness, HTML Release Passport (with journey section), Evidence Capsule including journey evidence
- ✅ **Weeks 7–8**: exception approval with owner/expiry/artifact binding, final human ship/hold record with override reason + immutable revisions, exceptions/decision sealed in the capsule, reusable GitHub Action with SARIF + step summary + artifacts + PR gate (ROOT fixed, inputs validated, journey-aware, gate-reflecting outputs), `attest init`/`doctor` onboarding, `docs/DESIGN_PARTNER_PILOT.md` pilot kit, CI (`build` + `test` + `demo` + `scripts/smoke-action.sh` + composite-action gate)
- 🔜 Release history, five Android design-partner pilots (hosted history only after two teams voluntarily run Attest for a second release)

## CI

Use the reusable action in `.github/actions/attest` (see `examples/github-action.yml` for a full workflow). It validates inputs (missing artifacts, incomplete journey pairs), runs `journey compare` first (text for the summary + JSON feeding `check`/`passport`), then `attest check` (text + SARIF must agree), seals the Passport / Evidence Capsule, uploads SARIF to GitHub code scanning, writes the release delta and blocking contradictions to the step summary, uploads the Passport / Capsule as workflow artifacts, and exits `2` to block the PR on confirmed contradictions or failed journeys (`fail-on: never` reports without failing). Top-level `exit-code` reflects the final gate including journey failures (`check-exit-code` / `compare-exit-code` exposed separately). It posts no PR comments and publishes no credentials, screenshots, or declaration contents by default.

Repository CI (`.github/workflows/ci.yml`) runs build, tests, demo + offline capsule verification, `doctor` on fresh templates, `actionlint` (advisory only), `scripts/smoke-action.sh`, and the composite action itself on demo fixtures.

The public action can also be referenced from another workflow as
`AminSS99/Attest/.github/actions/attest@main` (pin a commit SHA for production
use). Repository CI tests that published reference on GitHub's hosted runner
using **synthetic PulseFit fixtures**. This is a distribution check, not a real
customer release. See [the hosted-runner record](docs/HOSTED_ACTION_RUN.md).
