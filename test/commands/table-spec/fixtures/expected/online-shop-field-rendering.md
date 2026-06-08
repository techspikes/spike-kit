---
source: 'shop: tables.yaml'
source_sha256: test-sha256
generated_at: 2026-06-06T12:34:56.789Z
---

# online-shop

## products

Store products | prices.
Keep catalog values available.

| Column         | Data Type      | Nullable | Default   | Format | Check Values            | Description                          |
| -------------- | -------------- | -------- | --------- | ------ | ----------------------- | ------------------------------------ |
| id             | integer        | no       | 0         |        |                         |                                      |
| price          | decimal(18, 2) | no       | 0.5       |        |                         |                                      |
| rating         | numeric(3)     | yes      | null      |        |                         |                                      |
| active         | boolean        | no       | true      |        |                         |                                      |
| notes          | varchar(200)   | yes      |           |        |                         |                                      |
| contact\_email | varchar(254)   | yes      |           | email  |                         |                                      |
| status         | varchar(20)    | no       | available |        | available, discontinued | catalog \| state, availability label |

### Primary Key

| Constraint Name | Columns    |
| --------------- | ---------- |
| pk\_products    | id, status |

### Unique Constraints

| Constraint Name             | Columns       |
| --------------------------- | ------------- |
| ux\_products\_price\_rating | price, rating |

### Indexes

| Index Name           | Indexed Columns | Description                                                                 |
| -------------------- | --------------- | --------------------------------------------------------------------------- |
| ix\_products\_status | status          | Used for product \| catalog filtering. Reviewed during catalog maintenance. |
