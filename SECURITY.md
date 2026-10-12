# Security policy

Report sensitive security problems through [GitHub private vulnerability reporting](https://github.com/AminSS99/Attest/security/advisories/new), rather than a public issue.

Include the affected version, reproduction steps, and a minimal synthetic example where possible. Do not attach private APK/AAB files, reviewer screenshots, declarations, credentials, or evidence Capsules to a public issue.

Attest analyzes provided artifacts locally. Reviewer Twin explicitly uses an authorized ADB device; journeys store credential labels and expiry, not credential values. Capsules can contain sensitive release evidence and screenshots, so keep them private unless the owning team approves sharing.

Offline verification checks the integrity of files sealed in a Capsule. It does not prove that an artifact is safe, that declarations are legally correct, or that a store will approve a release. The current release is an early developer preview, with real-release validation still pending.
