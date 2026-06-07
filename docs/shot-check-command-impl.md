# `shot check` Subcommand Implementation Notes

This document records implementation choices for the behavior specified in `shot-check-command-spec.md`.

## Progress Output Implementation

`check` uses `@clack/prompts` for TUI-style progress output:

- `intro('Data Sketch validation')` is written before file processing starts.
- `log.success('Data Sketch read')` is written after a successful read and parse.
- `log.success('Validating Data Sketch')` is written after successful Data Sketch validation.
- `log.success('Data Sketch is valid')` is written after validation succeeds.
- `log.error()` is used for failed read, parse, or validation steps.
- `log.warn()` is used for warning steps if a warning is introduced.
- `outro(green('Succeeded'))` is written on success.
- `outro(red('Failed'))` is written after command failures.

The implementation does not use `spinner()`, `log.step()`, `note()`, or a `Reason` box. Failure reasons and validation issues are written as plain text.

## Error Stream Handling

Argument parsing and argument validation errors do not use clack. They are written directly to standard error in this format:

```text
Error: <reason>

Usage:
...
```

Read, parse, and Data Sketch validation failures are written to standard output because they are part of the TUI-mode command execution.

## Validation Flow

The command parses arguments with Node.js `parseArgs`.

When help is requested, it writes usage to standard output and returns `0` before any file work.

When one file argument is provided, the command reads and parses the file through `parseSpecificationFile`, then validates the parsed value with `validateSpecification`. The input file path is passed as `sourcePath` so trace source paths such as `sources.openapi` can resolve relative to the Data Sketch.

If validation fails, `result.issues.map(issue => issue.message)` is joined with newlines and written to standard output.

The outro message is colored with `picocolors.createColors(true)` so `Succeeded` and `Failed` remain colored even when the surrounding environment disables color for other output.
