import { parseSpecification } from '../../core/parser.ts'
import type { ValidationIssue } from '../../core/validator.ts'
import { validateSpecification } from '../../core/validator.ts'

export type ShotInput = {
  spec: string
  sources?: {
    openapi: (source: string) => Promise<string>
  }
}

export type ShotOutput =
  | {
      isValid: true
    }
  | {
      isValid: false
      issues: ValidationIssue[]
    }

export async function shot(input: ShotInput): Promise<ShotOutput> {
  const result = await validateSpecification(parseSpecification(input.spec), {
    loadOpenApiSource: input.sources?.openapi
  })

  if (!result.isValid) {
    return { isValid: false, issues: result.issues }
  }

  return { isValid: true }
}
