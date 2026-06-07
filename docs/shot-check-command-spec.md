# `shot check` Subcommand Specification

## Purpose

The `check` subcommand validates a Valuable Data Specification v1 YAML or JSON document.

## Command

```text
shot check <file>
shot check --help
shot check -h
```

- `<file>` is the path to a Valuable Data Specification v1 YAML or JSON file.
- `--help` and `-h` write command usage to standard output and exit with status `0` without validating a file.
- Exactly one file argument is required when help is not requested.
- The command exits with status `0` after successful validation.
- The command exits with status `1` when reading, parsing, argument validation, or Data Sketch validation fails.

## Progress Output

The command is non-interactive and does not prompt for input.

During validation, progress and final status messages are written to standard output:

```text
Data Sketch read
Validating Data Sketch
Data Sketch is valid
```

When reading or parsing fails, the failed step and the reason are written as plain text to standard output.

When Data Sketch validation fails, the failed validation step is written to standard output, followed by validation issue messages. Multiple validation issues are written one per line.

Argument errors write `Error: <reason>`, a blank line, and usage text to standard error.

## Validation Behavior

The command validates the parsed document as Valuable Data Specification v1. Trace validation is part of Data Sketch validation when the document requests it.

Successful validation does not write the input document or a transformed document. It reports only progress and final status.

Validation issue messages include the issue path and reason. The issue format matches the validator's user-facing issue messages.

## Valuable Data Specification v1 Example

The following input is a valid online-shop fixture:

```yaml
data-sketch: 1.0.0-draft.0
info:
  name: online-shop
stores:
  customer:
    name: customers
    reason: Persist customer information.
    trace:
      operations:
        - createCustomer
        - getCustomer
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
```

Expected successful progress output includes:

```text
Data Sketch read
Validating Data Sketch
Data Sketch is valid
```

## Invalid Document Example

The following input has multiple validation issues:

```yaml
info:
  name: ""
stores: {}
```

Expected failure output includes the failed validation step and issue messages for missing or invalid fields such as `data-sketch`, `info.name`, and `stores`.

```text
Validating Data Sketch failed
data-sketch: Invalid input: expected "1.0.0-draft.0"
info.name: Too small: expected string to have >=1 characters
stores: stores must not be empty
```
