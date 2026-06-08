import { load, type YAMLException } from 'js-yaml'

export function parseSpecification(spec: string): unknown {
  try {
    return load(spec)
  } catch (error) {
    throw new Error(`Failed to parse: ${(error as YAMLException).message}`)
  }
}
