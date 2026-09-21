# Attest — Product Plan

**Status:** product definition  
**Date:** 21 September 2026  
**Working description:** evidence-backed release readiness for mobile apps

## 1. Product thesis

Attest helps mobile teams prove that the app they are about to ship matches what they tell users, reviewers, and app stores.

Most products in this market already scan binaries, list SDKs and permissions, inspect network traffic, or help complete privacy declarations. Those capabilities are necessary, but they are not a sufficient product advantage. Attest should treat them as table stakes and build its identity around a harder question:

> **What changed in this release, which public promises are affected, and can the team prove the complete user journey still matches those promises?**

Attest's durable object is a **Release Passport**: a versioned, evidence-backed record connecting a particular build to store declarations, privacy claims, runtime journeys, reviewer instructions, exceptions, owners, and final release decisions.

Attest is not legal advice and must never promise guaranteed store approval. It provides traceable technical evidence, detects contradictions, and organizes release work so a human can make the final decision.

## 2. Initial audience

Start with teams shipping consumer or prosumer iOS and Android applications at least monthly:

- Mobile teams with 3–30 engineers and no dedicated mobile privacy specialist.
- Agencies that submit multiple client applications.
- React Native and Flutter teams that inherit behavior from many SDKs.
- AI-enabled mobile products that send user content to model providers.

The economic buyer may be an engineering lead, release manager, product-security lead, or agency owner. The daily user is the developer preparing a release.

Do not begin by targeting large regulated enterprises. Their procurement, security, and compliance expectations would force Attest to compete directly with mature enterprise mobile-security suites before its unique workflow is proven.

## 3. Core promise and first-run experience

**Positioning:**

> Attest shows exactly what changed in your mobile release, which declarations and reviewer materials are now outdated, and the evidence needed to ship confidently.

**First useful session:**

1. Create an application and upload the current release candidate plus the last shipped build.
2. Import current App Store/Play declarations, store copy, privacy policy, and optional test credentials.
3. Attest produces a release delta, not a generic list of findings.
4. The user reviews the five highest-impact truth gaps.
5. Attest creates a Release Passport with evidence, unresolved questions, owners, and a clear ship/hold recommendation.

The user should receive a useful comparison within five minutes without first configuring a large compliance program.

## 4. Product boundary

Attest owns:

- Release-level truth and evidence.
- Differences between two builds and their external declarations.
- Reviewer readiness and reproducible review journeys.
- Consent, denial, deletion, and disclosure journey evidence.
- Historical proof of what was known and approved for each release.

Attest does not become:

- A generic vulnerability scanner or penetration-testing suite.
- A consent-management SDK.
- A privacy-policy generator.
- A full legal or regulatory management platform.
- An app-store deployment service such as Fastlane.
- A replacement for App Store Connect or Play Console.
- A guarantee of approval or legal compliance.

## 5. Table-stakes foundation

These features are required for credibility but should not dominate Attest's marketing because established products already provide them:

1. APK/AAB and IPA metadata ingestion.
2. Permission, entitlement, capability, and manifest inventory.
3. Third-party SDK detection and version changes.
4. Privacy manifest and Google Data Safety worksheet comparison.
5. Declared network-domain inventory.
6. CI result, JSON/SARIF export, and pull-request annotation.
7. Rule packs for Apple and Google requirements.
8. Finding severity, source evidence, owner, exception, and remediation state.
9. Release-to-release diff for all collected facts.
10. Local CLI that can inspect artifacts without uploading source code.

The open-source core should provide artifact inspection, the evidence schema, local comparison, rule execution, and redacted export. The hosted product should provide policy updates, device journeys, collaboration, history, reviewer rooms, and portfolio reporting.

## 6. Signature features

The following features form Attest's differentiation. Each solves a problem a developer can recognize immediately, produces visible evidence, and strengthens the same Release Passport rather than creating an unrelated module. These are market hypotheses; competitor capabilities must be rechecked before implementation and launch.

### 6.1 Release Truth Graph

Attest connects claims and behavior instead of displaying separate reports.

**Inputs**

- Compiled build facts.
- Runtime observations.
- Store privacy declarations.
- Privacy policy sentences.
- Store listing claims and screenshots.
- SDK vendor declarations.
- Reviewer instructions.
- Team answers and approved exceptions.

**Output**

A graph where every public claim points to supporting or contradicting evidence. Examples:

- “Location is used only while using the app” → permission configuration, request timing, runtime destinations, privacy-policy paragraph.
- “Delete your account in Settings” → executable UI journey, API response, downstream processor status, screenshot/video evidence.
- “Your conversations are not used for model training” → selected AI provider, configured retention/training mode, disclosure text, and owner attestation.

Attest reports a **truth gap** when two sources disagree or when a claim has no evidence. The interface must say which sources conflict and avoid opaque risk scores.

### 6.2 Reviewer Twin

Attest rehearses the store review as a repeatable journey rather than another checklist.

- Record the path from fresh installation to each restricted or review-sensitive feature.
- Validate reviewer credentials, seeded account state, one-time codes, regional availability, feature flags, and backend dependencies.
- Capture exact screens, actions, network outcomes, and required explanations.
- Produce reviewer instructions with short clips and annotated screenshots.
- Re-run the same journey before every release and show the first step that changed.
- Detect dead credentials, empty reviewer accounts, unreachable gated screens, or instructions that no longer match the build.

The first version can use a human-guided recorder. Automated device execution comes only after the journey format and evidence model are stable.

### 6.3 Consent Journey Replay

Most scanners can find permissions; Attest should prove how the user encounters them.

- Record what the user sees immediately before a permission or tracking prompt.
- Verify that the requested permission is connected to the feature the user just selected.
- Replay Allow, Deny, Ask Next Time, restricted-device, child-account, and previously-revoked paths.
- Detect permission requests on first launch without contextual explanation.
- Check that denial does not trap the user and that settings recovery works.
- Compare consent wording and behavior across languages.
- Link each observed journey to the store declaration and privacy claim it supports.

The initial release supports a small set of high-impact permissions rather than claiming universal consent compliance.

### 6.4 Deletion Proof Drill

“We provide account deletion” is usually checked as a UI statement. Attest should verify the complete lifecycle.

1. Create a disposable test identity.
2. Generate known marker data through an approved test journey.
3. Request account deletion through the app.
4. Verify the user cannot authenticate again after the promised period.
5. Query configured first-party systems and supported processors for marker removal or anonymization.
6. Record retained records, their stated reason, and the responsible owner.
7. Produce a redacted deletion receipt for the Release Passport.

Attest must never run this against an unapproved production identity. The feature begins as an explicitly configured staging drill with adapters for a small number of systems.

### 6.5 Policy Time Machine

Attest versions its policy packs and can evaluate a release at different points in time.

- “Was version 3.2 ready under the policy active when it shipped?”
- “Which currently distributed builds will become problematic when this announced rule takes effect?”
- “Which declarations or journeys must change before the next submission?”
- “Which historical exception depended on a policy that has since changed?”

Every result cites the exact rule version, effective date, source URL, evaluation date, and evidence. AI may summarize the impact, but deterministic rules determine pass, fail, or needs-review status.

### 6.6 SDK Promise Ledger

Instead of only identifying an SDK, Attest keeps a versioned record of what that SDK causes the app team to promise.

- Data types, destinations, purposes, retention, tracking behavior, permissions, and required disclosures.
- Vendor documentation and privacy-manifest changes between SDK versions.
- Runtime behavior that agrees or conflicts with vendor documentation.
- Which application features actually require the SDK.
- Team owner and approved justification.
- Removal rehearsal showing which permissions, domains, disclosures, and app features disappear if the SDK is removed.
- A generated, evidence-linked vendor questionnaire for facts the binary cannot reveal.

The ledger should distinguish vendor claims, Attest observations, and team attestations. None should be silently converted into fact.

### 6.7 AI Data Journey

Attest models AI as a release behavior rather than a generic “uses AI” checkbox.

- Identify user inputs sent to model providers, including text, images, audio, location, identifiers, and attachments.
- Record provider, model class, region, retention setting, training setting, moderation path, fallback provider, and deletion behavior.
- Trace the user disclosure and consent shown before sensitive content is transmitted.
- Detect a provider or retention-mode change between releases.
- Test redaction boundaries using synthetic canary values.
- Produce a user-readable AI data card and reviewer evidence packet.

Attest must avoid collecting real sensitive prompts during testing. Synthetic canaries and test accounts are the default.

### 6.8 Claim-to-Screen Proof

Store listings often drift away from the shipped interface. Attest links marketing promises to executable evidence.

- Extract factual claims from listing copy and screenshots.
- Ask the team to connect each important claim to a recorded journey or mark it as editorial.
- Detect screenshots that show removed navigation, old subscription prices, unsupported languages, or unavailable regional features.
- Flag permission justification that conflicts with the promoted core functionality.
- Generate a listing-change checklist when a feature flag, entitlement, or UI journey changes.

This is not general marketing review. It is a narrow consistency check between the release candidate and the store surface used to approve and sell it.

### 6.9 Evidence Capsule

Each shipped build receives a portable, tamper-evident evidence package.

- Artifact hash and build identifiers.
- Rule and policy-pack versions.
- Declaration snapshot.
- Evidence graph and cited source material.
- Journey results and redacted media.
- Accepted exceptions, owners, expiry dates, and sign-offs.
- Unresolved questions and final release decision.
- Cryptographic manifest covering the included evidence.

The Capsule is exportable and remains readable without an Attest subscription. It proves what evidence existed and what decision was made; it does not certify legal compliance.

### 6.10 User-Facing Privacy Delta

Attest can produce a concise, plain-language explanation of privacy-relevant changes for release notes or an in-app disclosure:

- New data category or destination.
- New permission and the feature requiring it.
- SDK removal or replacement.
- AI provider or retention change.
- Account-deletion or consent-flow change.

Every sentence links back to evidence and requires human approval. This turns internal compliance work into visible user trust instead of burying it in a report.

## 7. Evidence model

Attest should make confidence and provenance part of the product language.

### Evidence classes

1. **Observed:** captured from a compiled artifact or controlled runtime journey.
2. **Declared:** supplied through App Store Connect, Play Console, a privacy policy, or vendor documentation.
3. **Attested:** confirmed by an authorized team member but not independently observable.
4. **Inferred:** suggested from several signals and awaiting review.
5. **Missing:** required evidence has not been supplied or observed.

### Finding states

- Confirmed contradiction.
- Changed and requires review.
- Evidence missing.
- Verified consistent.
- Accepted exception with owner and expiry.
- Not applicable with recorded rationale.

No finding should consist only of an AI-generated paragraph. Every finding needs source references, the comparison that triggered it, and a deterministic reason whenever possible.

## 8. Key product surfaces

### Release Command Center

One release, one decision. Show the five highest-impact changes, blocking truth gaps, journey status, owner progress, and the Release Passport action. Avoid a dashboard full of abstract scores.

### Truth Graph Explorer

Select a claim such as “account deletion” or “location usage” and see all supporting and conflicting evidence on one canvas. Default to a readable evidence chain rather than an unbounded graph visualization.

### Journey Studio

Record and replay reviewer, consent, deletion, purchase, restore, and restricted-content journeys. The primary object is a step with an expected visible state and evidence, not a brittle coordinate script.

### SDK Promise Ledger

A release-aware inventory showing what changed, what the team promises because of each SDK, and which app features depend on it.

### Policy Timeline

Upcoming effective dates, affected active builds, cited rule text, owners, and recommended preparation work.

### Reviewer Room

A temporary, access-controlled page containing reviewer instructions, current credentials or a secure retrieval flow, videos, expected test state, and support escalation. Access must be logged and expire automatically.

## 9. Eight-week MVP

The MVP proves the release-delta and evidence workflow. It does not attempt full automated device testing.

### Weeks 1–2: foundation

- Define the Release Passport, evidence, claim, finding, source, journey, exception, and policy-pack schemas.
- Build an Android AAB/APK inspector for permissions, SDK hints, target SDK, exported components, domains, and release identifiers.
- Import current build and previous build.
- Produce a deterministic release diff.
- Create the local CLI and JSON output.

### Weeks 3–4: truth comparison

- Import Google Data Safety answers through a versioned JSON/CSV representation.
- Import privacy-policy text and store listing copy.
- Implement the first Truth Graph relationships.
- Ship five high-confidence truth-gap rules.
- Require users to confirm ambiguous mappings.

### Weeks 5–6: reviewer evidence

- Create a human-guided Reviewer Twin recorder for web-accessible Android emulator/device sessions.
- Capture steps, screenshots, notes, and expected results.
- Add reviewer credential expiry/readiness checks without placing secrets inside exported evidence.
- Generate the first HTML Release Passport and Evidence Capsule manifest.

### Weeks 7–8: productization

- GitHub Action and pull-request summary.
- Team review, exception owner, expiry, and final ship/hold record.
- Hosted release history and release comparison.
- Five design-partner pilots with real release candidates.
- Measure time to first useful finding, confirmed contradictions, and findings acted upon.

### MVP signature

The demonstration must be unmistakable:

> Upload last week's build and today's release candidate. Attest shows that a newly added SDK introduced a permission and destination, the Data Safety answers and privacy policy do not cover them, and the reviewer instructions now fail at step four. One screen explains the evidence and creates the repair checklist.

If Attest cannot deliver that demonstration accurately, adding more rule packs will not create differentiation.

## 10. Post-MVP roadmap

### Phase 2: iOS and consent journeys

- IPA metadata and privacy-manifest inspection.
- App Store privacy declaration representation.
- Consent Journey Replay for selected permissions.
- SDK Promise Ledger versioning.
- User-facing Privacy Delta.

### Phase 3: executable proof

- Device runner for stable Reviewer Twin journeys.
- Deletion Proof Drill with staging adapters.
- AI Data Journey with synthetic canaries.
- Store screenshot and Claim-to-Screen comparison.
- Reviewer Room.

### Phase 4: policy intelligence

- Policy Time Machine.
- Upcoming-rule impact across active releases.
- Agency portfolio mode.
- Private rule packs and organization release policies.
- Evidence Capsule signing and independent verification CLI.

## 11. Technical architecture

### Components

- `attest-cli`: local artifact inspection and deterministic rule engine.
- `attest-schema`: open Release Passport, evidence, rule, journey, and capsule schemas.
- Artifact workers: isolated processing for AAB/APK first and IPA later.
- Evidence graph service: versioned facts, claims, sources, and relationships.
- Policy-pack registry: signed, dated, source-cited rules.
- Journey recorder/runner: human-guided first, device automation later.
- Web application: releases, evidence review, collaboration, and exports.
- Capsule verifier: offline validation of hashes and signatures.

### Security principles

- Local analysis is the default when possible.
- Source code is never required for the first product.
- Uploaded binaries have explicit retention controls and automatic deletion.
- Test credentials are stored separately from evidence, encrypted, access-logged, scoped, and expiring.
- Evidence exports redact secrets and personal data.
- Real user data is prohibited in automated journeys; synthetic identities and canaries are standard.
- Tenant isolation and signed artifact provenance are launch gates for the hosted product.

### AI boundaries

AI can:

- Extract candidate claims and policy obligations.
- Suggest relationships that a user confirms.
- Draft explanations, reviewer notes, and disclosure changes.
- Summarize evidence already present.

AI cannot:

- Invent runtime facts or SDK behavior.
- Mark a release compliant.
- Approve exceptions.
- Execute deletion or consent journeys without explicit configuration.
- Convert low-confidence inferences into blocking findings.

## 12. Open-source and commercial model

### Open source

- Artifact inspectors.
- Release diff engine.
- Evidence and rule schemas.
- Local rule runner.
- JSON/SARIF output.
- Evidence Capsule verifier.
- Community policy-pack contribution format.

Recommended license: Apache-2.0 for adoption and integration, while hosted collaboration and maintained policy intelligence remain commercial.

### Hosted free plan

- One app.
- Limited release history.
- Local scans with hosted report upload.
- Core public rule packs.
- One reviewer journey.

### Indie plan

- Multiple releases and full history.
- Android and iOS declaration comparisons.
- GitHub integration.
- Policy-change alerts.
- Release Passports and privacy deltas.

### Agency/team plan

- Multiple applications and clients.
- Reviewer Rooms.
- Team roles, exceptions, approval history, private rule packs, and portfolio timelines.
- Hosted journey execution and longer evidence retention.

Do not charge for the number of findings. Pricing should align with applications, active release volume, and hosted device work.

## 13. Success metrics

### Activation

- First build comparison completed.
- First confirmed truth gap reviewed.
- Time from upload to useful evidence.
- Previous declaration successfully imported.

### Product value

- Percentage of release candidates with at least one confirmed material change.
- Percentage of findings that cause a declaration, code, reviewer-instruction, or listing change.
- Reviewer journeys that would have failed before submission.
- Median time from finding to verified repair.
- Releases with complete Passports.

### Retention

- Teams scanning consecutive releases.
- CI checks run per active app.
- Policy changes reviewed before their effective date.
- Agencies adding a second client application.

Avoid optimizing for raw scan count or number of warnings; noisy findings destroy trust.

## 14. Validation plan and rejection criteria

Recruit five Android teams preparing a real release. Ask for the previous build, current candidate, current Data Safety answers, listing copy, privacy policy, and reviewer instructions. Run the workflow manually before automating it.

Continue only if:

- At least three teams have a meaningful release-to-declaration or reviewer-instruction mismatch.
- Teams understand the Release Passport without a compliance consultant.
- At least two teams want the comparison in CI for their next release.
- Evidence review takes less time than their current manual release preparation.

Stop or reposition if:

- The useful output is indistinguishable from Google Checks, OneTrust, NowSecure, or a basic artifact scanner.
- Most findings cannot be supported by deterministic evidence.
- Teams release too infrequently to maintain a recurring workflow.
- Reviewer journeys require bespoke consulting for every application.
- Users want a general mobile-security suite rather than release truth and evidence.

## 15. Competitive boundary

Current established capabilities include:

- Google Checks: SDK/data-flow monitoring, configurable policies, alerts, and Data Safety assistance.
- OneTrust App Scanner: uploaded binary inspection, SDK classification, permissions, data-type analysis, and compliance reports.
- NowSecure: static/dynamic mobile security and privacy testing, runtime behavior, CI integration, authenticated testing, and declaration validation.

Attest should not claim novelty merely because it compares permissions or scans SDKs. Its defensible workflow is the combination of a release-specific truth graph, repeatable reviewer and consent journeys, deletion proof, dated policy replay, and portable evidence that remains understandable after the release ships.

Research references:

- https://checks.google.com/app-compliance/
- https://developer.onetrust.com/onetrust/docs/how-app-scanner-works
- https://www.nowsecure.com/solutions/by-need/mobile-app-privacy-testing/
- https://developer.apple.com/app-store/user-privacy-and-data-use/
- https://support.google.com/googleplay/android-developer/answer/9214102
- https://developers.google.com/android-publisher/app-store-review/policy-declarations

## 16. Launch message

Avoid presenting Attest as another “AI compliance scanner.” The clear launch story is:

> **Every mobile release changes more than code. Attest compares the new build with the last one, shows which public promises are now wrong or unsupported, rehearses the reviewer journey, and creates the evidence your team used to ship.**

Suggested first tagline:

> **Prove your mobile release matches its promises.**

## 17. Immediate next actions

1. Interview five Android teams currently preparing a Play Store release.
2. Obtain redacted examples of previous/current builds, declarations, privacy policies, and reviewer instructions.
3. Finalize the open Release Passport schema before designing dashboards.
4. Build the two-build Android diff and five truth-gap rules.
5. Demonstrate one real contradiction from artifact to declaration to repair.
6. Recheck the `Attest` name for trademark, domain, package, and app-store conflicts before public branding.

