# Contributing

## Pull request quality gate

Pull requests targeting `main` must pass the [Web/API PR quality gate](./.github/workflows/web-api-pr-quality-gate.yml).
A failed or missing `Web/API PR quality gate` check means the commit is not QA-ready.
Repository branch protection should require that check before merge.

Run the same Web and Laravel checks locally with:

```bash
npm run check:all
```

This fast gate does not replace the [Mobile report upload contract workflows](./docs/testing/mobile-report-upload-contract-gate.md) or coordinated staging and device QA.
