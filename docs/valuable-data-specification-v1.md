# Valuable Data Specification v1

## Purpose

Valuable Data Specification v1 is a YAML-based specification for describing
data this service currently considers valuable enough to keep, based
on customer conversation and feedback.

A Valuable Data Specification YAML document can be called a Data Sketch when
describing the disposable document created from the specification. A Data Sketch is
expected to be rewritten or discarded when user stories or team learning change.

Valuable Data Specification v1 is intentionally designed as a single, self-contained document.

A true agile team prioritizes completing the most important user story and obtaining real feedback from its completion before expanding design work for later stories. Under that premise, the team does not need to split the Data Sketch for parallel authoring. Following Don't DRY Your Code Prematurely, splitting the document only for the convenience of parallel work can also create premature abstractions. If a customer sees the demo of the current user story and significantly changes the underlying assumptions, all of that fragmented abstraction work can become waste.

For this reason, Valuable Data Specification v1 does not define `$ref`, include, or partial-document composition semantics. A Data Sketch must be written as a complete canonical document, not as a graph of referenced fragments.

The `reason` and `trace` fields make the document AI First: they preserve enough
context for AI to understand why each data item exists and which user-facing
operations it supports.

This specification is also intended to be used as:

- input for tools that project the Data Sketch into storage-specific artifacts, such as relational Kysely migrations and migration diffs
- input for tools that convert the Data Sketch into human-friendly documents such as Markdown table specifications
- traceability between OpenAPI `operationId` and data definitions

---

## Core Terms

| Term | Meaning |
|---|---|
| Valuable Data | All data described by a Data Sketch. |
| `store` | A data set this service currently considers valuable enough to keep. |
| `field` | A data item kept inside a store. |
| `name` | The implementation-facing name for a store, field, key, or index. |
| `trace` | Metadata that links data definitions to OpenAPI operations. |
| `reason` | Human-readable explanation of why the item exists. |

---

## Root Structure

```yaml
data-sketch: 1.0.0-draft.0

info:
  name: online-shop

sources:
  openapi: ./openapi.yaml

stores:
  storeLogicalId:
    name: implementation_store_name
    reason: Why this store exists.
    trace:
      operations:
        - someOperationId
    fields:
      fieldLogicalId:
        name: implementation_field_name
        type:
          name: varchar
          length: 100
        nullable: false
```

---

## Root Fields

| Field | Required | Description |
|---|---:|---|
| `data-sketch` | yes | Must be `1.0.0-draft.0`. |
| `info` | yes | Information about the Data Sketch. |
| `sources` | no | External sources used for operation trace validation. |
| `stores` | yes | Map of logical store IDs to store definitions. |

Rules:

- Valuable Data Specification v1 does not define a database engine selector.
- A `stores` map key is a logical store ID. It is separate from `store.name`.

---

## Info

```yaml
info:
  name: online-shop
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Name of the Data Sketch. Must not be empty. |

---

## Sources

```yaml
sources:
  openapi: ./openapi.yaml
```

| Field | Required | Description |
|---|---:|---|
| `openapi` | no | Path to the OpenAPI YAML or JSON file used as an operation trace source. |

Rules:

- If `sources.openapi` is omitted, tools do not compare traced operations with an OpenAPI file.
- If `sources.openapi` is present, `shot` loads it as a path relative to the Data Sketch file.
- During OpenAPI trace validation, every traced operation ID must exist as an OpenAPI Operation Object `operationId`.
- Duplicate `operationId` values in the OpenAPI file are invalid for trace validation.
- An unreadable file, invalid YAML or JSON, or a missing traced operation ID is a trace validation error.

---

## Store

```yaml
stores:
  order:
    name: orders
    reason: Orders must be read and updated by order-related API operations.
    trace:
      operations:
        - createOrder
        - getOrderDetail
    fields:
      id:
        name: id
        type:
          name: integer
        nullable: false
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Implementation-facing store name. |
| `tentative` | no | Whether this store is tentative and needs human review. Defaults to false. |
| `reason` | yes | Why this store exists. |
| `trace` | yes | OpenAPI operation trace metadata. |
| `fields` | yes | Map of logical field IDs to field definitions. |
| `keys` | no | Data integrity key definitions. |
| `indexes` | no | Lookup or access-path intent definitions. |

Rules:

- A `fields` map key is a logical field ID. It is separate from `field.name`.

### Tentative Store Rule

```yaml
stores:
  orderDraft:
    name: order_drafts
    tentative: true
```

Rules:

- If omitted, `tentative` is treated as `false`.
- A store with `tentative: true` is still tentative and needs human review.
- Generative AI should set `tentative: true` for uncertain or newly inferred stores.
- Humans may also use `tentative: true` for manually drafted stores that need review.
- A human reviewer accepts the store by removing `tentative: true` or changing it to `tentative: false`.
- Report tools should clearly mark tentative stores.

---

## Trace

```yaml
trace:
  operations:
    - createOrder
    - getOrderDetail
```

| Field | Required | Description |
|---|---:|---|
| `operations` | yes | Non-empty list of OpenAPI `operationId` values. |

Rules:

- Store-level `trace.operations` is required.
- When `sources.openapi` is present, `shot` checks these values against OpenAPI Operation Object `operationId` values.

---

## Field

```yaml
fields:
  status:
    name: status
    type:
      name: varchar
      length: 20
    nullable: false
    aliases:
      - order status
    enum:
      - created
      - cancelled
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Implementation-facing field name. |
| `type` | yes | Field type definition. |
| `nullable` | yes | Whether the field may be null. |
| `default` | no | Literal default value. |
| `format` | no | Optional semantic hint such as `ulid`, `uuid`, or `email`. |
| `aliases` | no | Business-facing names or other aliases for the field. |
| `enum` | no | Allowed string values. |

---

## Type

```yaml
type:
  name: varchar
  length: 100
```

```yaml
type:
  name: decimal
  precision: 18
  scale: 2
```

```yaml
type:
  name: timestamp
```

| Field | Required | Description |
|---|---:|---|
| `name` | yes | Valuable Data Specification v1 type name. |
| `length` | no | Length for character types. |
| `precision` | no | Precision for numeric types. |
| `scale` | no | Scale for decimal or numeric types. |

Minimum v1 type subset:

```text
integer
smallint
boolean
char
varchar
decimal
numeric
date
time
timestamp
```

Rules:

- `boolean` is included as a practical exception even though SQL92 does not
  define a boolean data type.
- Generators may reject type names outside the v1 subset.

---

## Default

A default is represented directly as a scalar value.

```yaml
default: active
```

Rules:

- Use literal scalar YAML values only.
- Defaults are limited to literal values. Expressions, functions, and implementation-specific keywords are not valid default values.
- Generators should not interpret default values as executable expressions.

---

## Keys

Keys express data integrity constraints.

In Valuable Data Specification v1, keys describe persistence requirements such as identity, uniqueness, and references. Storage-specific generators decide how those requirements are projected into a concrete database engine.

```yaml
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
```

### Primary Key

```yaml
primary:
  name: pk_order_items
  fields:
    - orderId
    - lineNo
```

Rules:

- `name` is required.
- `fields` is required.
- Composite primary keys are represented by multiple fields.

### Unique Constraints

```yaml
unique:
  - name: ux_order_items_order_product
    fields:
      - orderId
      - productId
```

Rules:

- `name` is required.
- `fields` is required.
- Composite unique constraints are represented by multiple fields.

### Foreign Keys

```yaml
foreign:
  - name: fk_order_items_order
    fields:
      - orderId
    references:
      store: order
      fields:
        - id
    onDelete: cascade
    onUpdate: restrict
```

Composite foreign key:

```yaml
foreign:
  - name: fk_child_parent
    fields:
      - tenantId
      - parentId
    references:
      store: parent
      fields:
        - tenantId
        - id
```

Rules:

- `name` is required.
- Local `fields` must exist in the same store.
- Referenced `store` must exist.
- Referenced `fields` must exist in the referenced store.
- For composite foreign keys, local and referenced field counts must match.
- Field order is significant.

Supported referential actions:

```text
restrict
cascade
setNull
setDefault
noAction
```

---

## Indexes

Indexes express lookup or performance intent.

In Valuable Data Specification v1, indexes describe access-path intent. Storage-specific generators decide whether and how to create concrete indexes for their target database engine.

```yaml
indexes:
  - name: ix_orders_status
    fields:
      - status
    reason: Used to search orders by status.
```

Composite index:

```yaml
indexes:
  - name: ix_orders_customer_created_at
    fields:
      - customerId
      - createdAt
    reason: Used to list orders by customer and creation time.
```

Ordered index field:

```yaml
indexes:
  - name: ix_orders_created_at
    fields:
      - field: createdAt
        order: desc
```

Rules:

- `name` is required.
- `fields` is required and must be non-empty.
- Each field must exist in the same store.
- `reason` is optional but recommended.
- v1 supports normal indexes only.

---

## Validation Rules

A Data Sketch is valid only if:

- `data-sketch` is `1.0.0-draft.0`.
- `info.name` is a non-empty string.
- `stores` is not empty.
- Every store has `name`, `reason`, `trace.operations`, and `fields`.
- Every store has at least one field.
- Every field has `name`, `type.name`, and `nullable`.
- Store logical IDs are unique.
- Field logical IDs are unique within a store.
- Store `name` values are unique.
- Field `name` values are unique within a store.
- Key references point to existing fields.
- Foreign key references point to existing stores and fields.
- Composite foreign keys have equal local and referenced field counts.
- Index references point to existing fields.

---

## Source OpenAPI Example

The following OpenAPI document is the source context for the Valuable Data Specification example below.

```yaml
openapi: 3.0.3

info:
  title: Online Shop API
  version: 1.0.0

paths:
  /customers:
    post:
      operationId: createCustomer
      summary: Create a customer
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name]
              properties:
                name:
                  type: string
      responses:
        '201':
          description: Customer created

  /customers/{customerId}:
    get:
      operationId: getCustomer
      summary: Get a customer
      parameters:
        - name: customerId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Customer detail

  /orders:
    get:
      operationId: listOrders
      summary: List orders
      responses:
        '200':
          description: Order list
    post:
      operationId: createOrder
      summary: Create an order
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [customerId]
              properties:
                customerId:
                  type: string
      responses:
        '201':
          description: Order created

  /orders/{orderId}:
    get:
      operationId: getOrderDetail
      summary: Get an order
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Order detail

  /orders/{orderId}/cancel:
    post:
      operationId: cancelOrder
      summary: Cancel an order
      parameters:
        - name: orderId
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Order cancelled
```

---

## Data Sketch Example

The following Data Sketch is derived from the OpenAPI example above.

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
