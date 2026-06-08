# Test Guide

## Fixture Boundaries

Keep fixture references inside the responsibility boundary of the test file.

- Command tests live in `test/commands/<command>/<command>.test.ts`.
- Core tests live in `test/core/<module>/<module>.test.ts`.
- Fixtures live in a `fixtures/` directory next to the test file that owns them.
- `cli.test.ts` is the exception because it verifies cross-command dispatch.

Examples:

- `test/commands/check/check.test.ts` may use `test/commands/check/fixtures/`.
- `test/commands/table-spec/table-spec.test.ts` may use `test/commands/table-spec/fixtures/`.
- `test/commands/kysely-migration/kysely-migration.test.ts` may use `test/commands/kysely-migration/fixtures/`.
- `test/core/validator/validator.test.ts` may use `test/core/validator/fixtures/`.

Use a local `readFixtureFile('fixtures/...')` helper in each test file with
colocated fixtures. The helper must resolve from `fileURLToPath(import.meta.url)`
and reject paths outside that test file's directory.

Do not make a command test reach into another test's `fixtures/` directory. If a
command needs the same scenario, copy the fixture into that command's fixture
directory and keep the copy local to that command.

## Test Helpers

Use `test/helper.ts` for common test plumbing that would otherwise distract
from behavior assertions.

- Use local `readFixtureFile('fixtures/...')` helpers for fixture reads.
- Use `readTemporaryFile` and `writeTemporaryFile` for files under tmpfs.
- Use `createTemporaryDirectory` and `removeTemporaryDirectories` for temporary
  output directories.

Keep helpers small and literal. Do not hide behavior-specific expectations or
fixture choices behind generic helpers.

`test/commands/kysely-migration/kysely-migration.test.ts` is currently excluded
from this rule and may keep its existing file helpers until that test is
refactored separately.

## Output Assertions

Compare generated YAML, JSON, Markdown, and TypeScript output against static
fixture files with `assert.equal` or `assert.deepEqual`. Keep expected output
fixtures under the owning test's `fixtures/expected/` directory.

Use `assert.match` only for error messages, usage text, versions, timestamps,
generated file names, and other non-output text where exact static comparison is
not the behavior under test.

Use `runCommand` only for CLI behavior such as argument parsing, stdout/stderr,
exit codes, and real file output. Prefer `readFixtureFile('fixtures/...')`
followed by `shot(...)` when the library API covers the behavior directly.

## Fixture Duplication

Fixture duplication is acceptable when it keeps test ownership clear. A fixture
file belongs to the behavior being tested, not to the first test that happened
to need similar data.

Prefer descriptive fixture names that explain the behavior under test. Keep
fixture data static; do not generate test data inside test code.

## CLI Tests

`cli.test.ts` may reference command fixtures because it verifies root CLI
dispatch across subcommands. Keep those references minimal and use the fixture
for the command being dispatched.
