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

The [second hosted run](https://github.com/AminSS99/Attest/actions/runs/36121427748)
passed all five jobs, including `published-action-gate`. That job invoked
`AminSS99/Attest/.github/actions/attest@main` through the public Action
reference and asserted the expected `2 / 2 / 2` check, journey comparison,
and final gate outputs. The Action's exit 2 was intentional for the synthetic
HOLD fixture; the job asserted that behavior and passed.

These runs prove source distribution and hosted execution. They do not measure
setup time, misses, or usefulness on a real Android release.
