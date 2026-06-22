import { zodResolver } from '@hookform/resolvers/zod'
import {
  useForm,
  type FieldValues,
  type Resolver,
  type UseFormProps,
} from 'react-hook-form'
import type { z } from 'zod'

type FormValuesFromSchema<TSchema extends z.ZodTypeAny> = z.infer<TSchema> & FieldValues

type UseAppFormOptions<TSchema extends z.ZodTypeAny> = Omit<
  UseFormProps<FormValuesFromSchema<TSchema>>,
  'resolver'
> & {
  schema: TSchema
}

export const asFormInputValue = (value: string | null | undefined): string => value ?? ''

export const toNullableText = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? ''
  return trimmed ? trimmed : null
}

export function useAppForm<TSchema extends z.ZodTypeAny>({
  schema,
  ...options
}: UseAppFormOptions<TSchema>) {
  type TFieldValues = FormValuesFromSchema<TSchema>

  return useForm<TFieldValues>({
    ...options,
    resolver: zodResolver(schema as never) as unknown as Resolver<TFieldValues>,
  })
}