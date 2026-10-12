# Attest — product brief and execution plan

**Updated:** 29 September 2026<br>
**Stage:** public open-source core; real-release validation next<br>
**Working promise:** know what changed before you ship

This is the product source of truth and the handoff for the next person or AI working on Attest. Treat observed results, proposed features, and unverified claims as different things. Recheck repository and external status before changing this file.

The [original detailed vision](docs/PRODUCT_VISION_ARCHIVE.md) is kept for historical context. Section-number references in older source comments point to that archived version; its old status and timeline are not current commitments.

## 1. The product in one minute

Attest helps a mobile developer answer one release question: **Does the build we are about to ship still match what we tell users, app stores, and reviewers?**

A new SDK, permission, network destination, or broken reviewer path can make release materials inaccurate. Attest compares the last shipped build with a release candidate, identifies changes and *truth gaps*, and places source-linked findings in a **Release Passport**. A truth gap is a mismatch between observed build evidence and a declaration or claim, or a claim without enough evidence. The Passport recommends `SHIP`, `REVIEW`, or `HOLD`; a human records the final ship/hold decision. A sealed **Evidence Capsule** preserves what was known and decided and can be verified offline.

The initial user is an Android developer or release owner preparing a Play Store release. The wider vision includes iOS and teams managing repeated releases, but the current product is Android-first.

### The release workflow

1. Provide the last shipped APK/AAB, the candidate APK/AAB, and current Data Safety, privacy-policy, and listing materials.
2. Inspect the binary delta and source-linked truth gaps.
3. Record or compare a human-guided **Reviewer Twin** journey on an Android device.
4. Read the Passport, resolve or explicitly accept findings, and record a human decision.
5. Keep and verify the Evidence Capsule.

The signature synthetic demonstration is PulseFit 1.2.0 → 1.3.0: Amplitude, `CAMERA`, and `metrics.amplitude.com` appear; declarations lag; reviewer step four fails; Attest recommends `HOLD`. The fixture is **not evidence of a real customer's release**.

## 2. What exists, and what does not

| Area | Verified current state | Evidence |
| --- | --- | --- |
| Open-source core | Public Apache-2.0 repository with TypeScript CLI and schemas | [`packages/cli`](packages/cli), [`packages/schema`](packages/schema), [license](LICENSE) |
| Android inspection | APK/AAB facts, two-build diff, five deterministic truth-gap rules | CLI source and tests; `npm test` |
| Reviewer Twin | Human-guided ADB recording, comparison, first changed/failed step, instructions | [`packages/cli/src/journey.ts`](packages/cli/src/journey.ts) |
| Decision record | HTML/JSON Passport, exceptions, human ship/hold, immutable revisions, sealed Capsule, offline verifier | CLI source and demo |
| CI | Reusable GitHub Action, SARIF, summary, artifacts, configurable gate | [Action](.github/actions/attest), [hosted-runner record](docs/HOSTED_ACTION_RUN.md) |
| Website | Static public-facing site and guide, previewed locally; no deployment configured | [`apps/web`](apps/web), `npm run web:dev` |
| Distribution | Cloneable public source; no published npm package | [README](README.md) |

The Action has passed on GitHub-hosted Ubuntu, including invocation through the public Action reference, **using synthetic PulseFit fixtures**. A local external-directory tarball rehearsal also passed. These prove distribution mechanics, not usefulness on a real release. See [hosted validation](docs/HOSTED_ACTION_RUN.md) and [internal dry run](docs/INTERNAL_DRY_RUN.md); the older dry-run note saying the Action had never run on a hosted runner was superseded by the hosted validation.

**Still absent:** a real Android design-partner run; measured setup time, catches, and misses; iOS inspection; a native macOS app; a hosted dashboard or release history; fully automated device journeys; and an npm release. Do not imply any of these exist. Store approval is never guaranteed.

## 3. Product boundaries

Attest owns release-level evidence: what changed, which declarations or claims need review, whether the reviewer can reach a promised feature, who accepted exceptions, and who made the final decision. It is not a generic vulnerability scanner, privacy-policy generator, consent SDK, app-store deployment service, legal adviser, or compliance certifier.

Evidence is classified as **observed**, **declared**, **attested**, **inferred**, or **missing**. A finding must cite its sources and the comparison behind it. Inference is not silently promoted to observation. Exceptions remain visible and never rewrite the finding or Attest recommendation. Shipping over `HOLD` or `REVIEW` needs a recorded reason. Finalized decisions are immutable; corrections create a revision.

Local analysis is the default. Source code is not required. Build files, declarations, screenshots, and credential references are sensitive project material: do not publish them or place them in issue comments, PR comments, logs, or AI prompts. Reviewer credentials belong in the owning team's vault; journeys store a label and expiry, not the secret. The Capsule proves integrity of its included evidence, not legal correctness.

## 4. Product surfaces and repository shape

| Surface | Role | Status |
| --- | --- | --- |
| `packages/schema` | Versioned facts, findings, journeys, Passport, and Capsule types | Built |
| `packages/cli` | Local Android inspection, comparison, rules, recording, decision, export, verification | Built |
| `.github/actions/attest` | Use the same core in a release workflow | Validated with synthetic hosted runs |
| `apps/web` | Explain the product and guide source installation | Built locally; not deployed |
| Native macOS app | Possible future interface for local workflows | **Not built or committed to a roadmap date** |
| Hosted product | Potential history, collaboration, policy updates, and managed device journeys | **Not built** |

Keep the current monorepo while the core and website evolve together. GitHub's “TypeScript” label reflects the CLI and schemas, not a requirement that every interface use TypeScript. A separate web or macOS repository should follow a real need for independent ownership, release cadence, or distribution, not a language statistic. If a native macOS app is later validated, start by defining its user task and packaging plan; decide repository placement then.

## 5. Next milestone: real-release proof

The next unit of progress is **one authorized Android release**, not another speculative feature. No suitable real base/candidate pair has been provided yet. Use [pilot intake](docs/PILOT_INTAKE.md), [pilot kit](docs/DESIGN_PARTNER_PILOT.md), and [scorecard](docs/PILOT_SCORECARD.md).

### Inputs and ownership

An owning Android team supplies and authorizes use of:

- The exact last-shipped APK/AAB and release-candidate APK/AAB, with version names/codes.
- Current Data Safety answers as the supported JSON or CSV representation.
- Current privacy-policy text and Play listing copy.
- Optionally, a reviewer journey and ADB-capable device or emulator. Credential references may be used; secrets must stay in the team's vault.

Keep raw artifacts and declarations on the approved pilot machine. Return only an approved, redacted scorecard or other expressly authorized summary. If the required pair or authorization is absent, the pilot is blocked; do not substitute synthetic files and call it a pilot.

### Execution and done criteria

| Order | Work | Done when |
| --- | --- | --- |
| 1 | Prepare a clean install and onboarding path | A developer outside the Attest checkout follows the written install steps, runs `init` and `doctor`, and records friction and elapsed minutes. |
| 2 | Run the real comparison | Exact build/declaration inputs and tool version are recorded privately; `check` and `passport` complete or a reproducible blocker is documented. |
| 3 | Exercise Reviewer Twin where authorized | A human records the journey, compares it with an approved baseline if one exists, and notes any failed or changed step; absence of a baseline is explicit. |
| 4 | Review findings with the owning team | Each important finding is marked useful, false positive, unverified, or missed; evidence and the team's actual action are recorded. |
| 5 | Verify and report | `attest verify` passes for the Capsule; the redacted scorecard includes setup time, catches, misses, decision impact, and a clear synthetic-versus-real label. |
| 6 | Fix only observed friction | Reproduce, implement, test, and document the issues found in the pilot; do not expand the feature set to avoid measuring the existing product. |

After the first run, recruit up to five teams preparing real releases. A second release by the same team is more meaningful than a one-off demo. Measure time to first useful evidence, confirmed contradictions, false positives, misses, findings that caused a declaration/code/journey change, and whether teams ask to run it again.

The original validation hypothesis remains: continue investing if at least three of five teams find a meaningful mismatch, at least two want it in CI for the next release, and evidence review saves time versus their current process. Revisit positioning if most findings lack deterministic support or journeys need bespoke consulting for every app. These are **decision thresholds, not achieved results**.

## 6. Roadmap after evidence

1. **Make the current Android path easy to adopt.** Repair issues proven by the pilot, improve package distribution and documentation, keep the Action tested on hosted runners, and publish a package only after installation and release hygiene are verified. Never label an unpublished package as installable from npm.
2. **Prove repeat usage.** Run consecutive releases, compare Passports, and learn which history or team-review features are genuinely needed. Consider hosted history only after at least two teams voluntarily run a second release.
3. **Expand platform coverage.** iOS IPA/privacy-manifest inspection and App Store declaration representation need their own evidence model and tests. Do not market iOS support before an end-to-end real iOS run.
4. **Automate selected journeys.** Automate Reviewer Twin only after the human-guided format is stable across real apps; keep expected and observed screens reviewable.
5. **Build the broader evidence product where validated.** Candidates include consent replay, deletion proof in approved staging systems, SDK promise history, claim-to-screen checks, policy time travel, reviewer rooms, and user-facing privacy deltas. Each must connect to the Passport and cite evidence.

AI may help extract candidate claims, propose relationships, draft explanations, and summarize evidence. AI must not invent runtime observations, mark a release compliant, approve exceptions, make the human ship decision, or run sensitive journeys without explicit configuration. No “AI-powered compliance” positioning until there is a real, bounded AI feature to demonstrate.

Pricing and a hosted commercial model remain hypotheses. Do not create signup, pricing, pilot, or customer-proof claims from this plan alone.

## 7. Handoff for the next AI or maintainer

**Start here, in order:**

1. Read this file, [README](README.md), [pilot intake](docs/PILOT_INTAKE.md), [hosted-runner record](docs/HOSTED_ACTION_RUN.md), and the CLI `help`. Inspect `git status` first; preserve all uncommitted work.
2. Establish the baseline: run `npm ci` if needed, `npm test`, `npm run demo`, `npm run attest -- verify attest-out/demo/capsule`, and `npm run web:build`. Record exact commands and results. A demo passing is not a pilot.
3. Check whether an authorized design-partner input set exists. If it does, execute §5, using the pilot kit. If it does not, complete useful preparation that needs no private inputs, then request the missing artifacts and authorization from the owning team. Do not claim the milestone is complete while blocked.
4. Keep a concise work log: current state, changed files, evidence, checks, open blockers, and next action. Update this plan when a milestone is actually verified. Mark hypotheses and synthetic demonstrations visibly.
5. Treat the website, CLI, and Action as separate surfaces of one product. Keep links, claims, and install commands consistent. Do not deploy, publish packages, push, contact partners, or expose private artifacts merely because this plan describes those future actions; obtain the project owner's authorization for the specific external step.

**Quality bar:** preserve CLI tests and Capsule verification; add meaningful tests for behavioral fixes; check the website build and responsive behavior for site changes; keep secrets and user-specific paths out of public files. Report what was measured and what remains unknown. Avoid claiming an Apple/macOS app, real customer pilots, automated journeys, or store approval until there is direct evidence.
