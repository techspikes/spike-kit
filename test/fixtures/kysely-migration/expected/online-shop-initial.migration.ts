// ---
// data-sketch/embedded-db-projection-snapshot: 1.0.0-draft.0
// generated_at: 2026-06-06T12:34:56.789Z
// payload: |
//   H4sIAAAAAAAAA+VUsW7bMBD9l5tpV8nQQVuRLEHmToUg0OTJYkSRKnksYhj694KSTNOOitZut266
//   E/We3uO7O4LkxDe+QxLtJ7nbDM6+oSBlzcYbPvjWEpTwsC22xUY63tC2AAbEdxo9lN+OoCSUIIIn
//   26MDBob3mHU8MBBWh95kx5U8H5ye6TAglMfUM4R7dDAyMEHrSAZlw7VHBhIbHjTF050yEc32iggl
//   jCNb8Iew00q8ZCxzp14jEy2P/63R7KmF8vHzvawTXmJcqiuyH9xd8T0Uxa2EFYNg1PeAT9Z4clwZ
//   ms1dSMJ7neyvc+Xni8gMqSJeYx2qvXnFQ3xbMVBG4jsuhWhRdJdkFYPBqZ67wyseMoFDV69fPUxU
//   ySzrZB6XqfyPsnLyKOc99VaZ/1amJ07Bn8lS/duAPt6czyTSISeUXyjTOLdqTh+pSfXoiffD3SLD
//   IK8Jl9Y/JvyDCZwTfdf4JZimO8FkCzZDyRNTMXDYoEMj4tge5x39y008jyMDa55RI8WDDj05JaJR
//   1nydfMu748VWOAczSU2Rymf4Mm5jFe/qw5dJx0U8VmBywRlS9tk4+XnbwlpZPsu2qsafD2dd3SEH
//   AAA=
// ---

import type { Kysely } from 'kysely'

interface MigrationDatabase {
  "customers": {
    "id": number
    "public_id": string
    "name": string
  }
  "orders": {
    "id": number
    "public_id": string
    "customer_id": number
    "status": string
    "created_at": string
    "updated_at": string
  }
}

export async function up(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema
    .createTable("customers")
    .addColumn("id", "integer", column => column.notNull())
    .addColumn("public_id", "char(26)", column => column.notNull())
    .addColumn("name", "varchar(100)", column => column.notNull())
    .addPrimaryKeyConstraint("pk_customers", ["id"])
    .addUniqueConstraint("ux_customers_public_id", ["public_id"])
    .execute()

  await db.schema
    .createTable("orders")
    .addColumn("id", "integer", column => column.notNull())
    .addColumn("public_id", "char(26)", column => column.notNull())
    .addColumn("customer_id", "integer", column => column.notNull())
    .addColumn("status", "varchar(20)", column => column.notNull())
    .addColumn("created_at", "timestamp", column => column.notNull())
    .addColumn("updated_at", "timestamp", column => column.notNull())
    .addPrimaryKeyConstraint("pk_orders", ["id"])
    .addUniqueConstraint("ux_orders_public_id", ["public_id"])
    .addForeignKeyConstraint(
      "fk_orders_customer",
      ["customer_id"],
      "customers",
      ["id"],
      constraint => constraint.onDelete("restrict").onUpdate("restrict")
    )
    .execute()

  await db.schema
    .createIndex("ix_orders_status")
    .on("orders")
    .column("status")
    .execute()

  await db.schema
    .createIndex("ix_orders_customer_created_at")
    .on("orders")
    .columns(["customer_id", "created_at"])
    .execute()
}

export async function down(db: Kysely<MigrationDatabase>): Promise<void> {
  await db.schema.dropIndex("ix_orders_customer_created_at").execute()
  await db.schema.dropIndex("ix_orders_status").execute()
  await db.schema.alterTable("orders").dropConstraint("fk_orders_customer").execute()
  await db.schema.dropTable("orders").execute()
  await db.schema.dropTable("customers").execute()
}
