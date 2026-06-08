# `shot table-spec` Subcommand Implementation Notes

This document records implementation choices for the behavior specified in `shot-table-spec-command-spec.md`.

## Module Shape

The package exposes only the CLI entrypoint. It does not provide a public render
library API.

Within the source tree, `src/commands/table-spec/index.ts` exports the CLI
`runSteps(...)` function. `src/commands/table-spec/lib.ts` exports the
low-level `shot(...)` helper used by focused document rendering tests.

## Logging Implementation

`shot table-spec --output` and `shot table-spec -o` use the shared pino logger for help, success, and error output:

- Help usage is logged to standard output.
- Successful conversion logs `shot table-spec completed` to standard output.
- Failed argument parsing, file reads, validation, rendering, and file writes are logged to standard error.

The implementation does not use a note UI or a `Reason` box. Failure reasons and validation issues are logged as plain text.

## Error Stream Handling

Argument parsing and argument validation errors are logged in this format:

```text
Error: <reason>

Usage:
...
```

Read, validation, rendering, and write failures are logged through the shared
pino logger as plain text. `runSteps(...)` catches no errors itself; failures
propagate to the root CLI dispatcher, which returns exit status `1`.
