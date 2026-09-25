# GitHub-hosted Action validation

The first public push, commit `8925c936cc498735ae4f0e8fede003906151cac4`,
ran [CI on GitHub-hosted Ubuntu](https://github.com/AminSS99/Attest/actions/runs/36121194838).
All four jobs passed: `build-test-demo`, `action-validate`, `action-smoke`, and
`action-gate`.

The `action-gate` job exercised the composite Action on **synthetic PulseFit
fixtures**. It correctly reported `check-exit-code=2`,
`compare-exit-code=2`, and final `exit-code=2` for the HOLD case, while the
reporting-only `fail-on=never` run completed successfully. The workflow did
not test a real partner release.

The `published-action-gate` job added after that run exercises the public
`AminSS99/Attest/.github/actions/attest@main` reference on a hosted runner.
Its result should be recorded here after the first completed run.
