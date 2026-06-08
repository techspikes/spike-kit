import { load, type YAMLException } from 'js-yaml'
import type { z } from 'zod'
import { type IndexField, specificationSchema } from './spec.ts'

export type ValidationIssue = {
  path: (string | number)[]
  message: string
}

export type ValidationResult =
  | {
      isValid: true
      data: z.infer<typeof specificationSchema>
    }
  | {
      isValid: false
      issues: ValidationIssue[]
    }

export type ValidationOptions = {
  loadOpenApiSource?: (source: string) => Promise<string>
}

export async function validateSpecification(
  input: unknown,
  options: ValidationOptions = {}
): Promise<ValidationResult> {
  const schema = specificationSchema.superRefine((dsl, context) => {
    const storeNames = new Map<string, string>()

    for (const [storeId, store] of Object.entries(dsl.stores)) {
      const existingStoreId = storeNames.get(store.name)
      if (existingStoreId !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['stores', storeId, 'name'],
          message: `duplicate store name "${store.name}" also used by "${existingStoreId}"`
        })
      } else {
        storeNames.set(store.name, storeId)
      }

      const fieldNames = new Map<string, string>()
      for (const [fieldId, field] of Object.entries(store.fields)) {
        const existingFieldId = fieldNames.get(field.name)
        if (existingFieldId !== undefined) {
          context.addIssue({
            code: 'custom',
            path: ['stores', storeId, 'fields', fieldId, 'name'],
            message: `duplicate field name "${field.name}" also used by "${existingFieldId}"`
          })
        } else {
          fieldNames.set(field.name, fieldId)
        }
      }

      const hasLocalField = (fieldId: string) =>
        Object.hasOwn(store.fields, fieldId)

      if (store.keys?.primary !== undefined) {
        validateLocalFields(
          context,
          ['stores', storeId, 'keys', 'primary', 'fields'],
          store.keys.primary.fields,
          hasLocalField
        )
      }

      for (const [uniqueIndex, unique] of (
        store.keys?.unique ?? []
      ).entries()) {
        validateLocalFields(
          context,
          ['stores', storeId, 'keys', 'unique', uniqueIndex, 'fields'],
          unique.fields,
          hasLocalField
        )
      }

      for (const [foreignIndex, foreign] of (
        store.keys?.foreign ?? []
      ).entries()) {
        validateLocalFields(
          context,
          ['stores', storeId, 'keys', 'foreign', foreignIndex, 'fields'],
          foreign.fields,
          hasLocalField
        )

        const referencedStore = dsl.stores[foreign.references.store]
        if (referencedStore === undefined) {
          context.addIssue({
            code: 'custom',
            path: [
              'stores',
              storeId,
              'keys',
              'foreign',
              foreignIndex,
              'references',
              'store'
            ],
            message: `referenced store "${foreign.references.store}" does not exist`
          })
          continue
        }

        if (foreign.fields.length !== foreign.references.fields.length) {
          context.addIssue({
            code: 'custom',
            path: ['stores', storeId, 'keys', 'foreign', foreignIndex],
            message: 'foreign key field counts must match'
          })
        }

        validateLocalFields(
          context,
          [
            'stores',
            storeId,
            'keys',
            'foreign',
            foreignIndex,
            'references',
            'fields'
          ],
          foreign.references.fields,
          fieldId => Object.hasOwn(referencedStore.fields, fieldId)
        )
      }

      for (const [indexIndex, index] of (store.indexes ?? []).entries()) {
        for (const [fieldIndex, field] of index.fields.entries()) {
          const fieldId = indexFieldId(field)
          if (!hasLocalField(fieldId)) {
            context.addIssue({
              code: 'custom',
              path: [
                'stores',
                storeId,
                'indexes',
                indexIndex,
                'fields',
                fieldIndex
              ],
              message: `field "${fieldId}" does not exist`
            })
          }
        }
      }
    }
  })

  const result = schema.safeParse(input)

  if (result.success) {
    const traceIssues = await validateOpenApiTrace(result.data, options)
    if (traceIssues.length > 0) {
      return {
        isValid: false,
        issues: traceIssues
      }
    }

    return {
      isValid: true,
      data: result.data
    }
  }

  return {
    isValid: false,
    issues: result.error.issues.map(issue => ({
      path: issue.path.map(segment => String(segment)),
      message: formatIssue(issue)
    }))
  }
}

async function validateOpenApiTrace(
  dsl: z.infer<typeof specificationSchema>,
  options: ValidationOptions
): Promise<ValidationIssue[]> {
  const openApiSource = dsl.sources?.openapi
  if (openApiSource === undefined) return []
  if (options.loadOpenApiSource === undefined) {
    return [
      {
        path: ['sources', 'openapi'],
        message: `OpenAPI source loader is required for ${openApiSource}`
      }
    ]
  }

  let source: string
  try {
    source = await options.loadOpenApiSource(openApiSource)
  } catch (error) {
    return [
      {
        path: ['sources', 'openapi'],
        message: `Failed to read OpenAPI source ${openApiSource}: ${(error as Error).message}`
      }
    ]
  }

  let openApi: unknown
  try {
    openApi = load(source)
  } catch (error) {
    return [
      {
        path: ['sources', 'openapi'],
        message: `Failed to parse OpenAPI source ${openApiSource}: ${(error as YAMLException).message}`
      }
    ]
  }

  const operationIds = collectOpenApiOperationIds(openApi)
  const issues = operationIds.issues

  for (const [storeId, store] of Object.entries(dsl.stores)) {
    for (const [
      operationIndex,
      operationId
    ] of store.trace.operations.entries()) {
      if (!operationIds.values.has(operationId)) {
        issues.push({
          path: ['stores', storeId, 'trace', 'operations', operationIndex],
          message: `OpenAPI operationId "${operationId}" does not exist in sources.openapi`
        })
      }
    }
  }

  return issues
}

type OpenApiOperationIds = {
  values: Set<string>
  issues: ValidationIssue[]
}

const openApiHttpMethods = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace'
])

function collectOpenApiOperationIds(openApi: unknown): OpenApiOperationIds {
  const values = new Set<string>()
  const issues: ValidationIssue[] = []

  if (openApi === null || typeof openApi !== 'object') {
    return {
      values,
      issues: [
        {
          path: ['openapi', 'file'],
          message: 'OpenAPI document must be an object'
        }
      ]
    }
  }

  const paths = (openApi as Record<string, unknown>).paths
  if (paths === null || typeof paths !== 'object') {
    return {
      values,
      issues: [
        {
          path: ['openapi', 'paths'],
          message: 'OpenAPI paths must be an object'
        }
      ]
    }
  }

  for (const [pathName, pathItem] of Object.entries(paths)) {
    if (pathItem === null || typeof pathItem !== 'object') continue

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!openApiHttpMethods.has(method)) continue
      if (operation === null || typeof operation !== 'object') continue

      const operationId = (operation as Record<string, unknown>).operationId
      if (typeof operationId !== 'string') continue

      if (values.has(operationId)) {
        issues.push({
          path: ['openapi', 'paths', pathName, method, 'operationId'],
          message: `duplicate OpenAPI operationId "${operationId}"`
        })
      } else {
        values.add(operationId)
      }
    }
  }

  return { values, issues }
}

function validateLocalFields(
  context: z.RefinementCtx,
  path: (string | number)[],
  fields: string[],
  hasField: (fieldId: string) => boolean
) {
  for (const [index, field] of fields.entries()) {
    if (!hasField(field)) {
      context.addIssue({
        code: 'custom',
        path: [...path, index],
        message: `field "${field}" does not exist`
      })
    }
  }
}

function indexFieldId(field: IndexField) {
  return typeof field === 'string' ? field : field.field
}

function formatIssue(issue: z.core.$ZodIssue) {
  const path = issue.path.length > 0 ? issue.path.join('.') : '<root>'
  return `${path}: ${issue.message}`
}
