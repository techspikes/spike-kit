import { z } from 'zod'

const nonEmptyString = z.string().min(1)
const nonEmptyStringArray = z.array(nonEmptyString).min(1)
const literalDefault = z.union([z.string(), z.number(), z.boolean(), z.null()])

const fieldTypeNameSchema = z.enum([
  'integer',
  'smallint',
  'boolean',
  'char',
  'varchar',
  'decimal',
  'numeric',
  'date',
  'time',
  'timestamp'
])

const fieldTypeSchema = z.strictObject({
  name: fieldTypeNameSchema,
  length: z.number().int().positive().optional(),
  precision: z.number().int().positive().optional(),
  scale: z.number().int().nonnegative().optional()
})

const fieldSchema = z.strictObject({
  name: nonEmptyString,
  type: fieldTypeSchema,
  nullable: z.boolean(),
  default: literalDefault.optional(),
  format: nonEmptyString.optional(),
  aliases: nonEmptyStringArray.optional(),
  enum: nonEmptyStringArray.optional()
})

const namedFieldsSchema = z.strictObject({
  name: nonEmptyString,
  fields: nonEmptyStringArray
})

const referentialActionSchema = z.enum([
  'restrict',
  'cascade',
  'setNull',
  'setDefault',
  'noAction'
])

const foreignKeySchema = z.strictObject({
  name: nonEmptyString,
  fields: nonEmptyStringArray,
  references: z.strictObject({
    store: nonEmptyString,
    fields: nonEmptyStringArray
  }),
  onDelete: referentialActionSchema.optional(),
  onUpdate: referentialActionSchema.optional()
})

const keysSchema = z.strictObject({
  primary: namedFieldsSchema.optional(),
  unique: z.array(namedFieldsSchema).optional(),
  foreign: z.array(foreignKeySchema).optional()
})

const indexFieldSchema = z.union([
  nonEmptyString,
  z.strictObject({
    field: nonEmptyString,
    order: z.enum(['asc', 'desc']).optional()
  })
])

const indexSchema = z.strictObject({
  name: nonEmptyString,
  fields: z.array(indexFieldSchema).min(1),
  reason: nonEmptyString.optional()
})

const traceSchema = z.strictObject({
  operations: nonEmptyStringArray
})

const storeSchema = z.strictObject({
  name: nonEmptyString,
  tentative: z.boolean().optional(),
  reason: nonEmptyString,
  trace: traceSchema,
  fields: z
    .record(z.string(), fieldSchema)
    .refine(
      fields => Object.keys(fields).length > 0,
      'fields must not be empty'
    ),
  keys: keysSchema.optional(),
  indexes: z.array(indexSchema).optional()
})

export const specificationSchema = z.strictObject({
  'data-sketch': z.literal('1.0.0-draft.0'),
  info: z.strictObject({
    name: nonEmptyString
  }),
  sources: z
    .strictObject({
      openapi: nonEmptyString.optional()
    })
    .optional(),
  stores: z
    .record(z.string(), storeSchema)
    .refine(
      stores => Object.keys(stores).length > 0,
      'stores must not be empty'
    )
})

export type Specification = z.infer<typeof specificationSchema>
export type Store = Specification['stores'][string]
export type IndexField = z.infer<typeof indexFieldSchema>
