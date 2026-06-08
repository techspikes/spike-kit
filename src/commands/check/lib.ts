import { parseSpecificationText } from '../../core/parser.ts'
import { validateSpecification } from '../../core/validator.ts'

type CheckEvent = { type: 'parsed' } | { type: 'validated' }

type CheckDataSketchOptions = {
  sourceName?: string
  loadOpenApiSource?: (source: string) => Promise<string>
  onEvent?: (event: CheckEvent) => void
}

export async function checkDataSketch(
  source: string,
  options: CheckDataSketchOptions = {}
): Promise<string> {
  const input = parseSpecificationText(source, options.sourceName ?? '<input>')
  options.onEvent?.({ type: 'parsed' })

  const result = await validateSpecification(input, {
    loadOpenApiSource: options.loadOpenApiSource
  })

  if (!result.success) {
    return result.issues.map(issue => issue.message).join('\n')
  }

  options.onEvent?.({ type: 'validated' })
  return ''
}
