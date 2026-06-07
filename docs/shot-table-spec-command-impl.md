# `shot table-spec` Subcommand Implementation Notes

This document records implementation choices for the behavior specified in `shot-table-spec-command-spec.md`.

## Module Shape

The package exposes only the CLI entrypoint. It does not provide a public render
library API.

Within the source tree, `src/commands/table-spec.ts` exports
`runTableSpecCommand(args: string[])` and the low-level
`renderTableSpecDocument(...)` helper used by focused document rendering tests.

## Progress Output Implementation

`shot table-spec --output` and `shot table-spec -o` use `@clack/prompts` for TUI-style progress output:

- `intro('Table specification generation')` is written before file processing starts.
- `log.success()` is used for successful file reads and writes.
- `log.success()` is used for successful validation and rendering steps.
- `log.warn()` is used for warning steps if a warning is introduced.
- `log.success('Table specification generated')` is written after a successful file write.
- `log.error()` is used for failed processing steps.
- `outro(green('Succeeded'))` is written on success.
- `outro(red('Failed'))` is written after file-output mode failures.

The implementation does not use `note()` or a `Reason` box. Failure reasons and validation issues are written as plain text.

## Error Stream Handling

Argument parsing and argument validation errors do not use clack. They are written directly to standard error in this format:

```text
Error: <reason>

Usage:
...
```
