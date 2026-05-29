# Backend tests

## How to run

Always use the package script:

```bash
bun run test          # from apps/backend
# or from repo root:
bun run --filter backend test
```

The script is:

```jsonc
"test": "find test -name '*.test.ts' -print | sort | xargs -n1 bun test"
```

It runs **each test file in its own `bun test` process**.

## Why per-file isolation is required (do NOT run `bun test` over the whole dir)

Most test files mock dependencies with `vi.mock(...)` / `mock.module(...)`
(e.g. `vi.mock('../src/modules/chatbot/service', ...)`).

In Bun, `mock.module` registrations are **global and persistent for the
life of the process** — there is no reliable per-file teardown. If every
`*.test.ts` is loaded into a single `bun test` process, a mock registered
by file A stays active for files B, C, … loaded afterwards. A later file
that imports the *real* module then receives the earlier partial mock,
producing misleading failures such as:

- `ChatbotService.generateAgentReply is not a function`
- `BroadcastService.previewAudience` is undefined
- `__test__.normalizeFollowupRules` is undefined

These are **not real defects** — each file passes in isolation. Running
`bun test` (no per-file split) over the whole directory will report ~150
false failures purely from cross-file mock leakage.

### Rule of thumb

- ✅ `bun run test` — green, per-file isolation.
- ✅ `bun test test/some-file.test.ts` — fine, single file.
- ❌ `bun test` (whole `test/` directory in one process) — false failures
  from `mock.module` pollution. Do not use this to judge suite health.

## Property-based parity tests

`test/parity/*.test.ts` validate design.md Properties 1, 4, 5, 6, 7, 8, 9, 10.
They are pure/static (no DB) and run under the same per-file script.
Seed/iteration overrides: `OPENCRM_PROP_SEED`, `OPENCRM_PROP_COUNT`.
