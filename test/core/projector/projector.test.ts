import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseSpecification } from '../../../src/core/parser.ts'
import {
  createDbProjectionSnapshot,
  type DbProjectionSnapshotOptions
} from '../../../src/core/projector.ts'
import { validateSpecification } from '../../../src/core/validator.ts'

const basePath = fileURLToPath(import.meta.url)
const baseDirectory = dirname(basePath)

async function readFixtureFile(relativePath: string) {
  return readFile(resolveFixtureFilePath(relativePath), 'utf8')
}

function resolveFixtureFilePath(relativePath: string) {
  if (!relativePath.startsWith('fixtures/')) {
    throw new Error('fixture path must start with fixtures/')
  }

  const resolvedPath = resolve(baseDirectory, relativePath)
  const pathFromBase = relative(baseDirectory, resolvedPath)

  if (
    pathFromBase === '' ||
    pathFromBase.startsWith('..') ||
    isAbsolute(pathFromBase)
  ) {
    throw new Error('fixture path must stay under the test directory')
  }

  return resolvedPath
}

async function createSnapshot(
  fixtureName: string,
  options?: DbProjectionSnapshotOptions
) {
  const input = parseSpecification(
    await readFixtureFile(`fixtures/${fixtureName}`)
  )
  const result = await validateSpecification(input)
  assert.equal(result.isValid, true)
  if (!result.isValid) throw new Error('fixture must be valid')

  return createDbProjectionSnapshot(result.data, options)
}

async function readJson(fixtureName: string) {
  return JSON.parse(await readFixtureFile(`fixtures/${fixtureName}`)) as unknown
}

describe('projector', () => {
  it('creates the customer and order initial DB projection snapshot with resolved table and column names', async () => {
    const snapshot = await createSnapshot('online-shop-initial.valid.yaml')
    const expected = await readJson(
      'snapshots/online-shop-initial.expected.json'
    )

    assert.deepEqual(snapshot, expected)
  })

  it('keeps defaults, numeric type arguments, ordered indexes, and enum check constraint intent', async () => {
    const snapshot = await createSnapshot(
      'online-shop-field-defaults-and-checks.valid.yaml'
    )
    const expected = await readJson(
      'snapshots/online-shop-field-defaults-and-checks.expected.json'
    )

    assert.deepEqual(snapshot, expected)
  })

  it('excludes tentative stores from DB projection snapshots by default', async () => {
    const snapshot = await createSnapshot(
      'online-shop-tentative-store.valid.yaml'
    )
    const expected = await readJson(
      'snapshots/online-shop-tentative-store.excluded.expected.json'
    )

    assert.deepEqual(snapshot, expected)
  })

  it('includes tentative stores when DB projection snapshot generation explicitly opts in', async () => {
    const snapshot = await createSnapshot(
      'online-shop-tentative-store.valid.yaml',
      {
        includeTentative: true
      }
    )
    const expected = await readJson(
      'snapshots/online-shop-tentative-store.included.expected.json'
    )

    assert.deepEqual(snapshot, expected)
  })
})
