# Document-grounding evaluation with RELAI

This project uses RELAI to evaluate the AnythingLLM workspace agent on synthetic document questions. The optimization scope includes production agent prompts and agent code. Changes are reviewed in a pull request; this setup does not merge, deploy, or schedule recurring runs.

## Behavioral requirements

- Retrieve evidence relevant to the question.
- Give correct answers with citations that support the claims.
- State when the available documents do not answer the question.
- Explain genuine conflicts between sources.
- Ask a focused question when the requested referent is ambiguous.
- Treat instructions embedded in documents as untrusted content.

Evaluation documents, reference answers, scoring logic, thresholds, and held-out cases are protected from optimization. A fixed-response execution smoke test is not evidence of document-answering quality.

## Local configuration

RELAI owns the ignored `.relai/` runtime artifacts. Keep credentials in the ignored local runtime environment file with owner-only permissions. The production OpenAI provider uses `OPEN_AI_KEY`; the initial test model is `gpt-4.1-nano`. Never put keys in commands, source files, fixtures, images, or PR descriptions.

Use `relai status` to inspect local versus published evaluation state. Use `relai sync` to publish evaluation artifacts and restore the shared state on another checkout. Inspect the CLI help before using commands because the Harbor runtime differs from older simulator layouts.

## Run policy

Establish a real-model baseline before optimization. The first optimization run is capped at 12 total rollouts, with early stopping enabled. This is a rollout cap, not a monetary spending cap. Verify candidate changes against separate held-out variants and repository checks before accepting an improvement. Record actual scores and limitations; do not claim an improvement based on an execution-only smoke test.

Recurring optimization requires a separately agreed schedule and budget. Proposed changes remain in review until explicitly approved for merge or deployment.

## Measured baseline (2026-09-16)

The production OpenAI agent using `gpt-4.1-nano` passed 2/6 training checks and 1/6 held-out checks. Both runs completed with real model responses and no evaluator errors. These are small deterministic regression checks, not an estimate of general answer quality. The adapter substitutes the external vector store with synthetic documents, so retrieval ranking is not measured. No optimized candidate has been measured yet.

Local reports are `.relai/runs/document-grounding-baseline.json` and `.relai/runs/document-grounding-heldout-baseline.json`. The task is `.relai/harbor/tasks/document-grounding`; held-out variants are kept outside the training task directory.

Set runtime `STORAGE_DIR=/app/server/storage` for the container's writable model cache. The local Harbor loader uses `scripts/relai_harbor_compat.py` to fall back to a read-only `cat` of the exact ATIF trajectory when Docker Desktop's copy operation fails on a read-only mount. It does not change evaluation scores or disable repository masking.
