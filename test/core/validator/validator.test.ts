import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { parseSpecification } from '../../../src/core/parser.ts'
import { validateSpecification } from '../../../src/core/validator.ts'
import { fixturePath } from '../../helper.ts'

async function parseSpecificationFile(path: string): Promise<unknown> {
  const source = await readFile(path, 'utf8')
  return parseSpecification(source)
}

const validateFixture = async (spec: string) =>
  validateSpecification(
    await parseSpecificationFile(fixturePath(import.meta.url, spec)),
    {
      loadOpenApiSource: source =>
        readFile(fixturePath(import.meta.url, source), 'utf8')
    }
  )

const assertInvalidFixture = async (spec: string, pattern: RegExp) => {
  const result = await validateFixture(spec)

  if (!result.isValid) {
    assert.match(result.issues.map(issue => issue.message).join('\n'), pattern)
  } else {
    assert.fail()
  }
}

describe('validator', () => {
  describe('parsing', () => {
    it('parses the customer and order YAML fixture from the Data Sketch example', async () => {
      await parseSpecificationFile(
        fixturePath(import.meta.url, 'online-shop-minimal.valid.yaml')
      )
      assert.ok(true)
    })

    it('parses the customer and order JSON fixture from the Data Sketch example', async () => {
      await parseSpecificationFile(
        fixturePath(import.meta.url, 'online-shop-minimal.valid.json')
      )
      assert.ok(true)
    })

    it('reports an online shopping fixture with invalid YAML syntax', async () => {
      await assert.rejects(
        parseSpecificationFile(
          fixturePath(
            import.meta.url,
            'online-shop-invalid-syntax.invalid.yaml'
          )
        ),
        /Failed to parse/
      )
    })
  })

  describe('schema validation', () => {
    it('accepts the customer and order document from the Data Sketch example', async () => {
      const result = await validateFixture('online-shop-minimal.valid.yaml')
      assert.equal(result.isValid, true)
    })

    it('rejects a document without the Data Sketch version identifier', async () => {
      await assertInvalidFixture(
        'online-shop-missing-data-sketch-version.invalid.yaml',
        /data-sketch/
      )
    })

    it('rejects a document without info', async () => {
      await assertInvalidFixture(
        'online-shop-missing-info.invalid.yaml',
        /info/
      )
    })

    it('rejects a document with an empty info name', async () => {
      await assertInvalidFixture(
        'online-shop-empty-info-name.invalid.yaml',
        /name/
      )
    })

    it('rejects an empty stores map', async () => {
      await assertInvalidFixture(
        'online-shop-empty-stores.invalid.yaml',
        /stores/
      )
    })

    it('rejects a customer store without a reason', async () => {
      await assertInvalidFixture(
        'online-shop-store-missing-reason.invalid.yaml',
        /reason/
      )
    })

    it('rejects a customer store without trace metadata', async () => {
      await assertInvalidFixture(
        'online-shop-store-missing-trace.invalid.yaml',
        /trace/
      )
    })

    it('rejects a customer store without trace operations', async () => {
      await assertInvalidFixture(
        'online-shop-store-missing-trace-operations.invalid.yaml',
        /operations/
      )
    })

    it('rejects a customer store with no traced operations', async () => {
      await assertInvalidFixture(
        'online-shop-store-empty-trace-operations.invalid.yaml',
        /operations/
      )
    })

    it('rejects a customer store with an empty traced operation id', async () => {
      await assertInvalidFixture(
        'online-shop-store-empty-trace-operation.invalid.yaml',
        /operations/
      )
    })

    it('rejects a customer store with no fields', async () => {
      await assertInvalidFixture(
        'online-shop-store-empty-fields.invalid.yaml',
        /fields/
      )
    })

    it('rejects a customer field without a physical name', async () => {
      await assertInvalidFixture(
        'online-shop-field-missing-name.invalid.yaml',
        /name/
      )
    })

    it('rejects a customer field type without a type name', async () => {
      await assertInvalidFixture(
        'online-shop-field-missing-type-name.invalid.yaml',
        /type\.name/
      )
    })

    it('rejects a customer id field without nullable', async () => {
      await assertInvalidFixture(
        'online-shop-field-missing-nullable.invalid.yaml',
        /nullable/
      )
    })

    it('rejects a customer id field with a string nullable value', async () => {
      await assertInvalidFixture(
        'online-shop-field-nullable-string.invalid.yaml',
        /nullable/
      )
    })

    it('rejects an order field type outside the v1 subset', async () => {
      await assertInvalidFixture(
        'online-shop-field-unsupported-type.invalid.yaml',
        /type/
      )
    })

    it('rejects a product field using the removed bit type', async () => {
      await assertInvalidFixture(
        'online-shop-field-bit-type.invalid.yaml',
        /type/
      )
    })

    it('rejects a product field with no aliases', async () => {
      await assertInvalidFixture(
        'online-shop-field-empty-aliases.invalid.yaml',
        /aliases/
      )
    })

    it('rejects a product field with an empty alias', async () => {
      await assertInvalidFixture(
        'online-shop-field-empty-alias.invalid.yaml',
        /aliases/
      )
    })

    it('rejects a varchar field with zero length', async () => {
      await assertInvalidFixture(
        'online-shop-field-zero-length.invalid.yaml',
        /length/
      )
    })

    it('rejects a decimal field with zero precision', async () => {
      await assertInvalidFixture(
        'online-shop-field-zero-precision.invalid.yaml',
        /precision/
      )
    })

    it('rejects a decimal field with a negative scale', async () => {
      await assertInvalidFixture(
        'online-shop-field-negative-scale.invalid.yaml',
        /scale/
      )
    })

    it('rejects duplicate physical store names', async () => {
      await assertInvalidFixture(
        'online-shop-duplicate-store-names.invalid.yaml',
        /store name/
      )
    })

    it('rejects duplicate physical field names within a customer store', async () => {
      await assertInvalidFixture(
        'online-shop-duplicate-field-names.invalid.yaml',
        /field name/
      )
    })

    it('rejects an unknown root-level property', async () => {
      await assertInvalidFixture(
        'online-shop-root-unknown-property.invalid.yaml',
        /Unrecognized key/
      )
    })

    it('rejects an unknown customer store property', async () => {
      await assertInvalidFixture(
        'online-shop-store-unknown-property.invalid.yaml',
        /Unrecognized key/
      )
    })

    it('rejects an unknown customer field property', async () => {
      await assertInvalidFixture(
        'online-shop-field-unknown-property.invalid.yaml',
        /Unrecognized key/
      )
    })

    it('rejects an unknown customer field type property', async () => {
      await assertInvalidFixture(
        'online-shop-field-type-unknown-property.invalid.yaml',
        /Unrecognized key/
      )
    })

    it('rejects an unknown order foreign key property', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-unknown-property.invalid.yaml',
        /Unrecognized key/
      )
    })

    it('rejects a primary key that references a missing customer field', async () => {
      await assertInvalidFixture(
        'online-shop-primary-key-missing-field.invalid.yaml',
        /missingField/
      )
    })

    it('rejects a primary key with no fields', async () => {
      await assertInvalidFixture(
        'online-shop-primary-key-empty-fields.invalid.yaml',
        /fields/
      )
    })

    it('accepts a unique customer public id key', async () => {
      const result = await validateFixture(
        'online-shop-customer-public-id-unique.valid.yaml'
      )
      assert.equal(result.isValid, true)
    })

    it('rejects a unique customer public id key with no fields', async () => {
      await assertInvalidFixture(
        'online-shop-unique-key-empty-fields.invalid.yaml',
        /fields/
      )
    })

    it('rejects an order index that references a missing field', async () => {
      await assertInvalidFixture(
        'online-shop-index-missing-field.invalid.yaml',
        /missingField/
      )
    })

    it('rejects an order index with no fields', async () => {
      await assertInvalidFixture(
        'online-shop-index-empty-fields.invalid.yaml',
        /fields/
      )
    })

    it('accepts an order index field with explicit descending sort order', async () => {
      const result = await validateFixture(
        'online-shop-index-sort-order.valid.yaml'
      )
      assert.equal(result.isValid, true)
    })

    it('rejects an order index field with an unsupported sort order', async () => {
      await assertInvalidFixture(
        'online-shop-index-invalid-sort-order.invalid.yaml',
        /order/
      )
    })

    it('rejects an order foreign key that references a missing customer store', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-missing-store.invalid.yaml',
        /missingStore/
      )
    })

    it('rejects an order foreign key that references a missing customer field', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-missing-field.invalid.yaml',
        /missingField/
      )
    })

    it('rejects an order foreign key with no local fields', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-empty-local-fields.invalid.yaml',
        /fields/
      )
    })

    it('rejects an order foreign key with no referenced fields', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-empty-referenced-fields.invalid.yaml',
        /fields/
      )
    })

    it('rejects an order foreign key with an unsupported onDelete action', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-invalid-on-delete.invalid.yaml',
        /onDelete/
      )
    })

    it('rejects an order foreign key with mismatched field counts', async () => {
      await assertInvalidFixture(
        'online-shop-foreign-key-field-count-mismatch.invalid.yaml',
        /field counts/
      )
    })

    it('accepts a tentative order draft store', async () => {
      const result = await validateFixture(
        'online-shop-tentative-store.valid.yaml'
      )
      assert.equal(result.isValid, true)
    })
  })

  describe('trace validation', () => {
    it('accepts a Data Sketch when every traced operation exists in the OpenAPI file', async () => {
      const result = await validateFixture('online-shop-minimal.valid.yaml')
      assert.equal(result.isValid, true)
    })

    it('rejects OpenAPI trace validation when the OpenAPI file cannot be read', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-unreadable-file.invalid.yaml',
        /Failed to read OpenAPI source/
      )
    })

    it('rejects OpenAPI trace validation when the OpenAPI file cannot be parsed', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-invalid-syntax.invalid.yaml',
        /Failed to parse OpenAPI source/
      )
    })

    it('rejects duplicate OpenAPI operation IDs during trace validation', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-duplicate-operation-id.invalid.yaml',
        /duplicate OpenAPI operationId "createCustomer"/
      )
    })

    it('rejects OpenAPI trace validation when the OpenAPI root is not an object', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-root-null.invalid.yaml',
        /OpenAPI document must be an object/
      )
    })

    it('rejects OpenAPI trace validation when OpenAPI paths is missing', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-missing-paths.invalid.yaml',
        /OpenAPI paths must be an object/
      )
    })

    it('ignores non-operation OpenAPI path members during trace validation', async () => {
      const result = await validateFixture(
        'online-shop-sources-openapi-ignored-members.valid.yaml'
      )
      assert.equal(result.isValid, true)
    })

    it('requires an OpenAPI source loader when sources.openapi is declared', async () => {
      const fixture = 'online-shop-sources-openapi-cwd-file.valid.yaml'
      const result = await validateSpecification(
        await parseSpecificationFile(fixturePath(import.meta.url, fixture))
      )

      assert.equal(result.isValid, false)
      if (result.isValid) throw new Error('fixture must be invalid')
      assert.match(
        result.issues.map(issue => issue.message).join('\n'),
        /loader/
      )
    })

    it('rejects traced operations that are missing from the OpenAPI file', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-missing-operation.invalid.yaml',
        /OpenAPI operationId "missingOperation" does not exist in sources\.openapi/
      )
    })

    it('rejects OpenAPI trace validation when the OpenAPI file is missing', async () => {
      await assertInvalidFixture(
        'online-shop-sources-openapi-missing-file.invalid.yaml',
        /Failed to read OpenAPI source/
      )
    })
  })

  describe('error formatting', () => {
    it('formats a root-level null document validation error', async () => {
      await assertInvalidFixture('online-shop-root-null.invalid.yaml', /<root>/)
    })
  })
})
