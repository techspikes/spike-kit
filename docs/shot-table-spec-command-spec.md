# `shot table-spec` Subcommand Specification

## Purpose

The `table-spec` subcommand converts a valid Valuable Data Specification v1 YAML or JSON document into a human-readable table specification document in Markdown format.

## Command

```text
shot table-spec <file> --output <output-file>
shot table-spec <file> -o <output-file>
shot table-spec --help
shot table-spec -h
```

- `<file>` is the path to a Valuable Data Specification v1 YAML or JSON file.
- `--output` and `-o` write the generated UTF-8 Markdown to the specified file. An existing file is overwritten.
- Exactly one input file and `--output` or `-o` are required.
- `--help` and `-h` write command usage to standard output and exit with status `0` without performing conversion.
- The command exits with status `0` after successful conversion.
- No partial output, including front matter, is written when an error occurs.

## Logging

The command is non-interactive and does not prompt for input.

With `--output` or `-o`, successful conversion writes the generated Markdown file and logs only `shot table-spec completed` to standard output.

If an operation fails, the failed step and reason are logged to standard error.

Argument errors write `Error: <reason>`, a blank line, and usage text to standard error.

All Data Sketch validation failures, including trace validation failures, are reported as `Validating Data Sketch failed`, and no partial output is written.

## Output Structure

The output consists of YAML front matter followed by the generated document body. The document ends with a newline.

### Front Matter

```yaml
---
source: online-shop.yaml
source_sha256: <sha256>
generated_at: <generated-at>
---
```

| Property | Value |
| --- | --- |
| `source` | The input path's file name only, excluding its directory. |
| `source_sha256` | The lowercase hexadecimal SHA-256 digest of the input bytes. |
| `generated_at` | The generation time in UTC ISO 8601 format, such as `2026-06-06T12:34:56.789Z`. |

The digest is calculated before parsing or normalizing the input. The generated time is captured once for each command invocation.

### Document Title

The value of `info.name` is written as a level 1 heading.

```markdown
# online-shop
```

### Tables

Tables retain the Data Sketch store definition order. For each table:

1. The store definition's `name` is written as a level 2 heading. The `stores` map key is not used as the displayed name.
2. If `tentative` is `true`, the following warning is written as body text:

   ```markdown
   **This table is tentative and requires human review.**
   ```

3. The store's `reason` is written as body text.
4. The columns and any defined constraints and indexes are written as tables.

No tentative warning is written when `tentative` is omitted or `false`.

## Columns Table

Columns retain the Data Sketch field definition order. The table header is fixed:

```markdown
| Column | Data Type | Nullable | Default | Format | Check Values | Description |
| ------ | --------- | -------- | ------- | ------ | ------------ | ----------- |
```

| Column | Conversion rule |
| --- | --- |
| `Column` | The field definition's `name`. The `fields` map key is not displayed. |
| `Data Type` | The type name and its arguments, when present. |
| `Nullable` | `yes` when `nullable` is `true`; otherwise `no`. |
| `Default` | The literal `default` value, or an empty cell when omitted. |
| `Format` | The `format` value, or an empty cell when omitted. |
| `Check Values` | The `enum` values joined with `, `, or an empty cell when omitted. |
| `Description` | The `aliases` values joined with `, `, or an empty cell when omitted. |

Type values are formatted as follows:

- `length`: `<name>(<length>)`, for example `varchar(100)`.
- `precision` and `scale`: `<name>(<precision>, <scale>)`, for example `decimal(18, 2)`.
- `precision` without `scale`: `<name>(<precision>)`.
- No arguments: `type.name`, for example `timestamp`.

Default values are formatted as follows:

- Strings are written without quotation marks.
- Numbers and booleans use their YAML/JSON literal representation.
- An explicit null is written as `null`.
- An omitted default produces an empty cell and remains distinct from an explicit null.

## Constraint and Index Tables

Each defined kind is written as a separate level 3 heading and table. A heading and table are omitted when that kind is not defined.

Column references are resolved from Data Sketch field map keys to field definition names. Referenced tables are resolved from store map keys to store definition names. Composite column order is preserved.

### Primary Key

```markdown
### Primary Key

| Constraint Name | Columns |
| --------------- | ------- |
```

### Unique Constraints

Unique constraints retain their definition order.

```markdown
### Unique Constraints

| Constraint Name | Columns |
| --------------- | ------- |
```

### Foreign Keys

Foreign keys retain their definition order. An omitted referential action produces an empty cell.

```markdown
### Foreign Keys

| Constraint Name | Columns | Referenced Table | Referenced Columns | On Delete | On Update |
| --------------- | ------- | ---------------- | ------------------ | --------- | --------- |
```

### Indexes

Indexes retain their definition order. Composite index field order is preserved. An ordered field is written as `<column> asc` or `<column> desc`. An omitted `reason` produces an empty cell.

```markdown
### Indexes

| Index Name | Indexed Columns | Description |
| ---------- | --------------- | ----------- |
```

Multiple columns in any constraint or index table cell are joined with `, `.

## Markdown Escaping

- A `|` in a table cell is escaped as `\|`.
- A line break in a table cell is removed and replaced with a single space.
- Other Markdown-sensitive characters may be escaped by the Markdown serializer
  while preserving the rendered text.

## Valuable Data Specification v1 Example

The following input is the complete online-shop example from the Valuable Data Specification v1 specification, treated as a file named `online-shop.yaml`.

```yaml
data-sketch: 1.0.0-draft.0

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

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

      publicId:
        name: public_id
        type:
          name: char
          length: 26
        nullable: false
        format: ulid
        aliases:
          - customer number
          - customer code

      name:
        name: name
        type:
          name: varchar
          length: 100
        nullable: false
        aliases:
          - customer full name

    keys:
      primary:
        name: pk_customers
        fields:
          - id

      unique:
        - name: ux_customers_public_id
          fields:
            - publicId

  order:
    name: orders
    reason: Order operations need to create, read, list, and cancel orders.
    trace:
      operations:
        - createOrder
        - getOrderDetail
        - cancelOrder
        - listOrders

    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false

      publicId:
        name: public_id
        type:
          name: char
          length: 26
        nullable: false
        format: ulid
        aliases:
          - order number

      customerId:
        name: customer_id
        type:
          name: integer
        nullable: false
        aliases:
          - buyer customer

      status:
        name: status
        type:
          name: varchar
          length: 20
        nullable: false
        aliases:
          - order state
          - fulfillment status
        enum:
          - created
          - cancelled

      createdAt:
        name: created_at
        type:
          name: timestamp
        nullable: false

      updatedAt:
        name: updated_at
        type:
          name: timestamp
        nullable: false

    keys:
      primary:
        name: pk_orders
        fields:
          - id

      unique:
        - name: ux_orders_public_id
          fields:
            - publicId

      foreign:
        - name: fk_orders_customer
          fields:
            - customerId
          references:
            store: customer
            fields:
              - id
          onDelete: restrict
          onUpdate: restrict

    indexes:
      - name: ix_orders_status
        fields:
          - status
        reason: Used to search orders by status.

      - name: ix_orders_customer_created_at
        fields:
          - customerId
          - createdAt
        reason: Used to list orders for a customer.
```

### Expected Output

`<sha256>` and `<generated-at>` represent invocation-dependent metadata.

```markdown
---
source: online-shop.yaml
source_sha256: <sha256>
generated_at: <generated-at>
---

# online-shop

## customers

Persist customer information.

| Column     | Data Type    | Nullable | Default | Format | Check Values | Description                    |
| ---------- | ------------ | -------- | ------- | ------ | ------------ | ------------------------------ |
| id         | integer      | no       |         |        |              |                                |
| public\_id | char(26)     | no       |         | ulid   |              | customer number, customer code |
| name       | varchar(100) | no       |         |        |              | customer full name             |

### Primary Key

| Constraint Name | Columns |
| --------------- | ------- |
| pk\_customers   | id      |

### Unique Constraints

| Constraint Name           | Columns    |
| ------------------------- | ---------- |
| ux\_customers\_public\_id | public\_id |

## orders

Order operations need to create, read, list, and cancel orders.

| Column       | Data Type   | Nullable | Default | Format | Check Values       | Description                     |
| ------------ | ----------- | -------- | ------- | ------ | ------------------ | ------------------------------- |
| id           | integer     | no       |         |        |                    |                                 |
| public\_id   | char(26)    | no       |         | ulid   |                    | order number                    |
| customer\_id | integer     | no       |         |        |                    | buyer customer                  |
| status       | varchar(20) | no       |         |        | created, cancelled | order state, fulfillment status |
| created\_at  | timestamp   | no       |         |        |                    |                                 |
| updated\_at  | timestamp   | no       |         |        |                    |                                 |

### Primary Key

| Constraint Name | Columns |
| --------------- | ------- |
| pk\_orders      | id      |

### Unique Constraints

| Constraint Name        | Columns    |
| ---------------------- | ---------- |
| ux\_orders\_public\_id | public\_id |

### Foreign Keys

| Constraint Name      | Columns      | Referenced Table | Referenced Columns | On Delete | On Update |
| -------------------- | ------------ | ---------------- | ------------------ | --------- | --------- |
| fk\_orders\_customer | customer\_id | customers        | id                 | restrict  | restrict  |

### Indexes

| Index Name                        | Indexed Columns           | Description                         |
| --------------------------------- | ------------------------- | ----------------------------------- |
| ix\_orders\_status                | status                    | Used to search orders by status.    |
| ix\_orders\_customer\_created\_at | customer\_id, created\_at | Used to list orders for a customer. |
```

## Tentative Store Example

Store definition excerpt:

```yaml
stores:
  orderDraft:
    name: order_drafts
    tentative: true
    reason: Persist draft orders pending review.
```

Table body output:

```markdown
## order_drafts

**This table is tentative and requires human review.**

Persist draft orders pending review.
```

## Excluded Properties

`data-sketch`, `sources`, and `trace` are not included in the document body. `tentative` is represented only by the warning defined above.
