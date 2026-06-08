# `shot check` Subcommand Implementation Notes

This document records implementation choices for the behavior specified in `shot-check-command-spec.md`.

## Progress Output Implementation

`check` uses the shared pino logger for progress output:

- `Data Sketch validation` is logged before file processing starts.
- `Data Sketch read` is logged after a successful read and parse.
- `Validating Data Sketch` is logged after successful Data Sketch validation.
- `Data Sketch is valid` is logged after validation succeeds.
- Error logs are used for failed read, parse, or validation steps.
- Warning logs are used for warning steps if a warning is introduced.

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

When one file argument is provided, the command reads and parses the file through `parseSpecificationFile`, then validates the parsed value with `validateSpecification`. The input file path is passed as `sourcePath` so trace source paths such as `sources.openapi` can resolve relative to the Data Sketch.

If validation fails, `result.issues.map(issue => issue.message)` is joined with newlines and logged.

The default CLI logger uses `pino-pretty` with color enabled.
