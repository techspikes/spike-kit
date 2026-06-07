import { readFile } from 'node:fs/promises'
import { load, type YAMLException } from 'js-yaml'

export async function parseSpecificationFile(
  filePath: string
): Promise<unknown> {
  const source = await readFile(filePath, 'utf8')

  return parseSpecificationText(source, filePath)
}

export function parseSpecificationText(
  source: string,
  sourceName: string
): unknown {
  try {
    return load(source)
  } catch (error) {
    throw new Error(
      `Failed to parse ${sourceName}: ${(error as YAMLException).message}`
    )
  }
}
