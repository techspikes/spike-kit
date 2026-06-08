# `shot table-spec` Subcommand Implementation Notes

This document records implementation choices for the behavior specified in `shot-table-spec-command-spec.md`.

## Module Shape

The package exposes only the CLI entrypoint. It does not provide a public render
library API.

Within the source tree, `src/commands/table-spec/index.ts` exports the CLI
`runSteps(...)` function. `src/commands/table-spec/lib.ts` exports the
low-level `shot(...)` helper used by focused document rendering tests.

## Progress Output Implementation

`shot table-spec --output` and `shot table-spec -o` use the shared pino logger for progress output:

- `Table specification generation` is logged before file processing starts.
- Info logs are used for successful file reads and writes.
- Info logs are used for successful validation and rendering steps.
- Warning logs are used for warning steps if a warning is introduced.
- `Table specification generated` is logged after a successful file write.
- Error logs are used for failed processing steps.

The implementation does not use a note UI or a `Reason` box. Failure reasons and validation issues are logged as plain text.

## Error Stream Handling

Argument parsing and argument validation errors are logged in this format:

```text
Error: <reason>

Usage:
...
```
