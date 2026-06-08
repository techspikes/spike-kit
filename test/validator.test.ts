import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseSpecificationFile } from '../src/core/parser.ts'
import { validateSpecification } from '../src/core/validator.ts'
import { fixturePath } from './helper/helper.ts'

const validateFixture = async (name: string) =>
  validateSpecification(
    await parseSpecificationFile(fixturePath('validator', name)),
    {
      sourcePath: fixturePath('validator', name)
    }
  )

const errorMessages = async (name: string) =>
  (await validateFixture(name)).issues.map(issue => issue.message).join('\n')

describe('validator', () => {
  describe('parsing', () => {
    it('parses the customer and order YAML fixture from the Data Sketch example', async () => {
      const result = await parseSpecificationFile(
        fixturePath('validator', 'online-shop-minimal.valid.yaml')
      )

      assert.partialDeepStrictEqual(result, {
        'data-sketch': '1.0.0-draft.0',
        info: {
          name: 'online-shop'
        },
        stores: {
          customer: {
            name: 'customers'
          },
          order: {
            name: 'orders'
          }
        }
      })
    })

    it('parses the customer and order JSON fixture from the Data Sketch example', async () => {
      const result = await parseSpecificationFile(
        fixturePath('validator', 'online-shop-minimal.valid.json')
      )

      assert.partialDeepStrictEqual(result, {
        'data-sketch': '1.0.0-draft.0',
        info: {
          name: 'online-shop'
        },
        stores: {
          customer: {
            fields: {
              publicId: {
                name: 'public_id'
              }
            }
          }
        }
      })
    })

    it('reports an online shopping fixture with invalid YAML syntax', async () => {
      await assert.rejects(
        parseSpecificationFile(
          fixturePath('validator', 'online-shop-invalid-syntax.invalid.yaml')
        ),
        /Failed to parse/
      )
    })
  })

  describe('schema validation', () => {
    it('accepts the customer and order document from the Data Sketch example', async () => {
      const result = await validateFixture('online-shop-minimal.valid.yaml')

      assert.equal(result.success, true)
    })

    it('rejects a document without the Data Sketch version identifier', async () => {
      const result = await validateFixture(
        'online-shop-missing-data-sketch-version.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-missing-data-sketch-version.invalid.yaml'
        ),
        /data-sketch/
      )
    })

    it('rejects a document without info', async () => {
      const result = await validateFixture(
        'online-shop-missing-info.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-missing-info.invalid.yaml'),
        /info/
      )
    })

    it('rejects a document with an empty info name', async () => {
      const result = await validateFixture(
        'online-shop-empty-info-name.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-empty-info-name.invalid.yaml'),
        /name/
      )
    })

    it('rejects an empty stores map', async () => {
      const result = await validateFixture(
        'online-shop-empty-stores.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-empty-stores.invalid.yaml'),
        /stores/
      )
    })

    it('rejects a customer store without a reason', async () => {
      const result = await validateFixture(
        'online-shop-store-missing-reason.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-store-missing-reason.invalid.yaml'),
        /reason/
      )
    })

    it('rejects a customer store without trace metadata', async () => {
      const result = await validateFixture(
        'online-shop-store-missing-trace.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-store-missing-trace.invalid.yaml'),
        /trace/
      )
    })

    it('rejects a customer store without trace operations', async () => {
      const result = await validateFixture(
        'online-shop-store-missing-trace-operations.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-store-missing-trace-operations.invalid.yaml'
        ),
        /operations/
      )
    })

    it('rejects a customer store with no traced operations', async () => {
      const result = await validateFixture(
        'online-shop-store-empty-trace-operations.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-store-empty-trace-operations.invalid.yaml'
        ),
        /operations/
      )
    })

    it('rejects a customer store with an empty traced operation id', async () => {
      const result = await validateFixture(
        'online-shop-store-empty-trace-operation.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-store-empty-trace-operation.invalid.yaml'
        ),
        /operations/
      )
    })

    it('rejects a customer store with no fields', async () => {
      const result = await validateFixture(
        'online-shop-store-empty-fields.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-store-empty-fields.invalid.yaml'),
        /fields/
      )
    })

    it('rejects a customer field without a physical name', async () => {
      const result = await validateFixture(
        'online-shop-field-missing-name.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-missing-name.invalid.yaml'),
        /name/
      )
    })

    it('rejects a customer field type without a type name', async () => {
      const result = await validateFixture(
        'online-shop-field-missing-type-name.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-missing-type-name.invalid.yaml'),
        /type\.name/
      )
    })

    it('rejects a customer id field without nullable', async () => {
      const result = await validateFixture(
        'online-shop-field-missing-nullable.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-missing-nullable.invalid.yaml'),
        /nullable/
      )
    })

    it('rejects a customer id field with a string nullable value', async () => {
      const result = await validateFixture(
        'online-shop-field-nullable-string.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-nullable-string.invalid.yaml'),
        /nullable/
      )
    })

    it('rejects an order field type outside the v1 subset', async () => {
      const result = await validateFixture(
        'online-shop-field-unsupported-type.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-unsupported-type.invalid.yaml'),
        /type/
      )
    })

    it('rejects a product field using the removed bit type', async () => {
      const result = await validateFixture(
        'online-shop-field-bit-type.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-bit-type.invalid.yaml'),
        /type/
      )
    })

    it('rejects a product field with no aliases', async () => {
      const result = await validateFixture(
        'online-shop-field-empty-aliases.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-empty-aliases.invalid.yaml'),
        /aliases/
      )
    })

    it('rejects a product field with an empty alias', async () => {
      const result = await validateFixture(
        'online-shop-field-empty-alias.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-empty-alias.invalid.yaml'),
        /aliases/
      )
    })

    it('rejects a varchar field with zero length', async () => {
      const result = await validateFixture(
        'online-shop-field-zero-length.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-zero-length.invalid.yaml'),
        /length/
      )
    })

    it('rejects a decimal field with zero precision', async () => {
      const result = await validateFixture(
        'online-shop-field-zero-precision.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-zero-precision.invalid.yaml'),
        /precision/
      )
    })

    it('rejects a decimal field with a negative scale', async () => {
      const result = await validateFixture(
        'online-shop-field-negative-scale.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-negative-scale.invalid.yaml'),
        /scale/
      )
    })

    it('rejects duplicate physical store names', async () => {
      const result = await validateFixture(
        'online-shop-duplicate-store-names.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-duplicate-store-names.invalid.yaml'),
        /store name/
      )
    })

    it('rejects duplicate physical field names within a customer store', async () => {
      const result = await validateFixture(
        'online-shop-duplicate-field-names.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-duplicate-field-names.invalid.yaml'),
        /field name/
      )
    })

    it('rejects an unknown root-level property', async () => {
      const result = await validateFixture(
        'online-shop-root-unknown-property.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-root-unknown-property.invalid.yaml'),
        /Unrecognized key/
      )
    })

    it('rejects an unknown customer store property', async () => {
      const result = await validateFixture(
        'online-shop-store-unknown-property.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-store-unknown-property.invalid.yaml'),
        /Unrecognized key/
      )
    })

    it('rejects an unknown customer field property', async () => {
      const result = await validateFixture(
        'online-shop-field-unknown-property.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-field-unknown-property.invalid.yaml'),
        /Unrecognized key/
      )
    })

    it('rejects an unknown customer field type property', async () => {
      const result = await validateFixture(
        'online-shop-field-type-unknown-property.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-field-type-unknown-property.invalid.yaml'
        ),
        /Unrecognized key/
      )
    })

    it('rejects an unknown order foreign key property', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-unknown-property.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-unknown-property.invalid.yaml'
        ),
        /Unrecognized key/
      )
    })

    it('rejects a primary key that references a missing customer field', async () => {
      const result = await validateFixture(
        'online-shop-primary-key-missing-field.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-primary-key-missing-field.invalid.yaml'
        ),
        /missingField/
      )
    })

    it('rejects a primary key with no fields', async () => {
      const result = await validateFixture(
        'online-shop-primary-key-empty-fields.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-primary-key-empty-fields.invalid.yaml'
        ),
        /fields/
      )
    })

    it('accepts a unique customer public id key', async () => {
      const result = await validateFixture(
        'online-shop-customer-public-id-unique.valid.yaml'
      )

      assert.equal(result.success, true)
    })

    it('rejects a unique customer public id key with no fields', async () => {
      const result = await validateFixture(
        'online-shop-unique-key-empty-fields.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-unique-key-empty-fields.invalid.yaml'),
        /fields/
      )
    })

    it('rejects an order index that references a missing field', async () => {
      const result = await validateFixture(
        'online-shop-index-missing-field.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-index-missing-field.invalid.yaml'),
        /missingField/
      )
    })

    it('rejects an order index with no fields', async () => {
      const result = await validateFixture(
        'online-shop-index-empty-fields.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages('online-shop-index-empty-fields.invalid.yaml'),
        /fields/
      )
    })

    it('accepts an order index field with explicit descending sort order', async () => {
      const result = await validateFixture(
        'online-shop-index-sort-order.valid.yaml'
      )

      assert.equal(result.success, true)
    })

    it('rejects an order index field with an unsupported sort order', async () => {
      const result = await validateFixture(
        'online-shop-index-invalid-sort-order.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-index-invalid-sort-order.invalid.yaml'
        ),
        /order/
      )
    })

    it('rejects an order foreign key that references a missing customer store', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-missing-store.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-missing-store.invalid.yaml'
        ),
        /missingStore/
      )
    })

    it('rejects an order foreign key that references a missing customer field', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-missing-field.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-missing-field.invalid.yaml'
        ),
        /missingField/
      )
    })

    it('rejects an order foreign key with no local fields', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-empty-local-fields.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-empty-local-fields.invalid.yaml'
        ),
        /fields/
      )
    })

    it('rejects an order foreign key with no referenced fields', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-empty-referenced-fields.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-empty-referenced-fields.invalid.yaml'
        ),
        /fields/
      )
    })

    it('rejects an order foreign key with an unsupported onDelete action', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-invalid-on-delete.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-invalid-on-delete.invalid.yaml'
        ),
        /onDelete/
      )
    })

    it('rejects an order foreign key with mismatched field counts', async () => {
      const result = await validateFixture(
        'online-shop-foreign-key-field-count-mismatch.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-foreign-key-field-count-mismatch.invalid.yaml'
        ),
        /field counts/
      )
    })

    it('accepts a tentative order draft store', async () => {
      const result = await validateFixture(
        'online-shop-tentative-store.valid.yaml'
      )

      assert.equal(result.success, true)
    })
  })

  describe('trace validation', () => {
    it('accepts a Data Sketch when every traced operation exists in the OpenAPI file', async () => {
      const result = await validateFixture('online-shop-minimal.valid.yaml')

      assert.equal(result.success, true)
    })

    it('rejects OpenAPI trace validation when the OpenAPI file cannot be read', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-unreadable-file.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-unreadable-file.invalid.yaml'
        ),
        /Failed to read OpenAPI source/
      )
    })

    it('rejects OpenAPI trace validation when the OpenAPI file cannot be parsed', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-invalid-syntax.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-invalid-syntax.invalid.yaml'
        ),
        /Failed to parse OpenAPI source/
      )
    })

    it('rejects duplicate OpenAPI operation IDs during trace validation', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-duplicate-operation-id.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-duplicate-operation-id.invalid.yaml'
        ),
        /duplicate OpenAPI operationId "createCustomer"/
      )
    })

    it('rejects OpenAPI trace validation when the OpenAPI root is not an object', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-root-null.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-root-null.invalid.yaml'
        ),
        /OpenAPI document must be an object/
      )
    })

    it('rejects OpenAPI trace validation when OpenAPI paths is missing', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-missing-paths.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-missing-paths.invalid.yaml'
        ),
        /OpenAPI paths must be an object/
      )
    })

    it('ignores non-operation OpenAPI path members during trace validation', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-noisy-file.valid.yaml'
      )

      assert.equal(result.success, true)
    })

    it('resolves an OpenAPI file from the current working directory when source path is omitted', async () => {
      const fixture = 'online-shop-sources-openapi-cwd-file.valid.yaml'
      const result = await validateSpecification(
        await parseSpecificationFile(fixturePath('validator', fixture))
      )

      assert.equal(result.success, true)
    })

    it('rejects traced operations that are missing from the OpenAPI file', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-missing-operation.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-missing-operation.invalid.yaml'
        ),
        /OpenAPI operationId "missingOperation" does not exist in sources\.openapi/
      )
    })

    it('rejects OpenAPI trace validation when the OpenAPI file is missing', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-missing-file.invalid.yaml'
      )

      assert.equal(result.success, false)
      assert.match(
        await errorMessages(
          'online-shop-sources-openapi-missing-file.invalid.yaml'
        ),
        /Failed to read OpenAPI source/
      )
    })
  })

  describe('error formatting', () => {
    it('formats a root-level null document validation error', async () => {
      const result = await validateFixture('online-shop-root-null.invalid.yaml')

      assert.equal(result.success, false)
      assert.match(result.issues[0]?.message ?? '', /<root>/)
    })
  })
})
