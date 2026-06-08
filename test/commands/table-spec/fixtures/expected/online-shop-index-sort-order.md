---
source: online-shop-index-sort-order.valid.yaml
source_sha256: test-sha256
generated_at: 2026-06-06T12:34:56.789Z
---

# online-shop

## orders

Order operations need to create, read, list, and cancel orders.

| Column      | Data Type   | Nullable | Default | Format | Check Values       | Description |
| ----------- | ----------- | -------- | ------- | ------ | ------------------ | ----------- |
| id          | integer     | no       |         |        |                    |             |
| status      | varchar(20) | no       |         |        | created, cancelled |             |
| created\_at | timestamp   | no       |         |        |                    |             |

### Indexes

| Index Name              | Indexed Columns  | Description                       |
| ----------------------- | ---------------- | --------------------------------- |
| ix\_orders\_created\_at | created\_at desc | Used to list recent orders first. |
