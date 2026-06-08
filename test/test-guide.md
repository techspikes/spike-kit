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

Use `fixturePath(import.meta.url, ...)` from `test/helper.ts` in tests
with colocated fixtures. Do not make a command test reach into another test's
`fixtures/` directory. If a command needs the same scenario, copy the fixture
into that command's fixture directory and keep the copy local to that command.

## Test Helpers

Use `test/helper.ts` for common test plumbing that would otherwise distract
from behavior assertions.

- Use `fixturePath(import.meta.url, ...)` for colocated fixtures.
- Use `readTextFile` and `writeTextFile` instead of importing
  `node:fs/promises` in command tests.
- Use `joinFilePath` and `joinTemporaryFilePath` instead of importing
  `node:path` or `node:os` in command tests.
- Use `createTemporaryDirectory` and `removeTemporaryDirectories` for temporary
  output directories.

Keep helpers small and literal. Do not hide behavior-specific expectations or
fixture choices behind generic helpers.

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
