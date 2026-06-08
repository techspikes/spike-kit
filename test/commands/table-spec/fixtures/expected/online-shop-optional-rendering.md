---
source: online-shop-optional-rendering.valid.yaml
source_sha256: test-sha256
generated_at: 2026-06-06T12:34:56.789Z
---

# online-shop

## customers

Persist customer information.

| Column | Data Type | Nullable | Default | Format | Check Values | Description |
| ------ | --------- | -------- | ------- | ------ | ------------ | ----------- |
| id     | integer   | no       |         |        |              |             |

## orders

Persist orders for customer purchases.

| Column       | Data Type | Nullable | Default | Format | Check Values | Description |
| ------------ | --------- | -------- | ------- | ------ | ------------ | ----------- |
| id           | integer   | no       |         |        |              |             |
| customer\_id | integer   | no       |         |        |              |             |
| created\_at  | timestamp | no       |         |        |              |             |

### Foreign Keys

| Constraint Name      | Columns      | Referenced Table | Referenced Columns | On Delete | On Update |
| -------------------- | ------------ | ---------------- | ------------------ | --------- | --------- |
| fk\_orders\_customer | customer\_id | customers        | id                 |           |           |

### Indexes

| Index Name              | Indexed Columns | Description |
| ----------------------- | --------------- | ----------- |
| ix\_orders\_created\_at | created\_at     |             |
