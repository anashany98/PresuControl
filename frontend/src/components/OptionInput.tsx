import { useId, type InputHTMLAttributes } from 'react'

type OptionInputProps = InputHTMLAttributes<HTMLInputElement> & {
  options?: string[]
}

export function OptionInput({ options = [], list, autoComplete = 'off', ...props }: OptionInputProps) {
  const generatedId = useId().replace(/:/g, '')
  const listId = list || `options-${generatedId}`
  const cleanOptions = options.filter(Boolean)

  return (
    <>
      <input {...props} autoComplete={autoComplete} list={cleanOptions.length ? listId : undefined} />
      {cleanOptions.length > 0 && (
        <datalist id={listId}>
          {cleanOptions.map(option => <option key={option} value={option} />)}
        </datalist>
      )}
    </>
  )
}
