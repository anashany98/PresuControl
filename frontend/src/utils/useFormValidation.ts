import { useState, useCallback } from 'react'

export type ValidationRule = {
  field: string
  validate: (value: any, allValues?: any) => string | null
}

export type ValidationErrors = Record<string, string | null>

export function useFormValidation(rules: ValidationRule[]) {
  const [errors, setErrors] = useState<ValidationErrors>({})

  const validateField = useCallback((field: string, value: any, allValues?: any) => {
    const rule = rules.find(r => r.field === field)
    if (!rule) return null
    const error = rule.validate(value, allValues)
    setErrors(prev => ({ ...prev, [field]: error }))
    return error
  }, [rules])

  const validateAll = useCallback((values: any): boolean => {
    const newErrors: ValidationErrors = {}
    let valid = true
    for (const rule of rules) {
      const error = rule.validate(values[rule.field], values)
      newErrors[rule.field] = error
      if (error) valid = false
    }
    setErrors(newErrors)
    return valid
  }, [rules])

  const clearErrors = useCallback(() => setErrors({}), [])

  return { errors, validateField, validateAll, clearErrors, setErrors }
}