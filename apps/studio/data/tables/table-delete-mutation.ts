import { useMutation, UseMutationOptions, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { entityTypeKeys } from 'data/entity-types/keys'
import { del, handleError } from 'data/fetchers'
import { viewKeys } from 'data/views/keys'
import type { ResponseError } from 'types'
import { tableKeys } from './keys'
import { sqlKeys } from 'data/sql/keys'

export type TableDeleteVariables = {
  projectRef: string
  connectionString?: string
  id: number
  schema: string
  cascade?: boolean
}

export async function deleteTable({
  projectRef,
  connectionString,
  id,
  cascade = false,
}: TableDeleteVariables) {
  let headers = new Headers()
  if (connectionString) headers.set('x-connection-encrypted', connectionString)

  const { data, error } = await del('/platform/pg-meta/{ref}/tables', {
    params: {
      header: { 'x-connection-encrypted': connectionString! },
      path: { ref: projectRef },
      query: { id, cascade },
    },
    headers,
  })

  if (error) handleError(error)
  return data
}

type TableDeleteData = Awaited<ReturnType<typeof deleteTable>>

export const useTableDeleteMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseMutationOptions<TableDeleteData, ResponseError, TableDeleteVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()

  return useMutation<TableDeleteData, ResponseError, TableDeleteVariables>(
    (vars) => deleteTable(vars),
    {
      async onSuccess(data, variables, context) {
        const { id, projectRef, schema } = variables
        await Promise.all([
          queryClient.invalidateQueries(sqlKeys.query(projectRef, ['table-editor', id])),
          queryClient.invalidateQueries(tableKeys.list(projectRef, schema)),
          queryClient.invalidateQueries(entityTypeKeys.list(projectRef)),
          // invalidate all views from this schema
          queryClient.invalidateQueries(viewKeys.listBySchema(projectRef, schema)),
        ])

        await onSuccess?.(data, variables, context)
      },
      async onError(data, variables, context) {
        if (onError === undefined) {
          toast.error(`Failed to delete database table: ${data.message}`)
        } else {
          onError(data, variables, context)
        }
      },
      ...options,
    }
  )
}
