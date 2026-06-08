# `shot check` Subcommand Implementation Notes

This document records implementation choices for the behavior specified in `shot-check-command-spec.md`.

## Logging Implementation

`check` uses the shared pino logger for help, success, and error output:

- Help usage is logged to standard output.
- Successful validation logs `shot check completed` to standard output.
- Argument, read, parse, and validation failures are logged to standard error.

The implementation does not use a spinner, step UI, note UI, or a `Reason` box. Failure reasons and validation issues are logged as plain text.

## Error Stream Handling

Argument parsing and argument validation errors are logged in this format:

```text
Error: <reason>

Usage:
...
```

Read, parse, and Data Sketch validation failures are logged through pino.

## Validation Flow

The command parses arguments with Node.js `parseArgs`.

When help is requested, it logs usage and returns `0` before any file work.

When one file argument is provided, `runSteps(...)` reads the file, then calls
`shot(...)`. The `shot(...)` helper parses and validates the source text. For
trace validation, `runSteps(...)` provides an OpenAPI source loader that resolves
`sources.openapi` relative to the Data Sketch file path.

If validation fails, `result.issues.map(issue => issue.message)` is joined with newlines and logged.

The default CLI logger uses `pino-pretty` with color enabled.
