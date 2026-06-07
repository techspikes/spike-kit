---
source: online-shop-minimal.valid.yaml
source_sha256: 33057655ad2687f583a20b9e15e4023d96871ad240ed45eb5b1a91268986fb0f
generated_at: 2026-06-06T12:34:56.789Z
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
