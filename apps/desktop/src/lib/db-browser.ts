import { invoke } from '@tauri-apps/api/core'

export type DbBrowserSortDirection = 'asc' | 'desc'

export interface DbBrowserTable {
  name: string
}

export interface DbBrowserColumn {
  name: string
  dataType: string
  nullable: boolean
  isPrimaryKey: boolean
}

export interface DbBrowserQueryRequest {
  table: string
  page: number
  pageSize: number
  sortColumn?: string
  sortDirection?: DbBrowserSortDirection
  search?: string
}

export interface DbBrowserQueryResponse {
  table: string
  page: number
  pageSize: number
  total: number
  rows: Record<string, unknown>[]
}

export function listDbBrowserTables(): Promise<DbBrowserTable[]> {
  return invoke<DbBrowserTable[]>('db_browser_list_tables')
}

export function describeDbBrowserTable(table: string): Promise<DbBrowserColumn[]> {
  return invoke<DbBrowserColumn[]>('db_browser_describe_table', { table })
}

export function queryDbBrowserRows(
  request: DbBrowserQueryRequest
): Promise<DbBrowserQueryResponse> {
  return invoke<DbBrowserQueryResponse>('db_browser_query_rows', {
    table: request.table,
    page: request.page,
    pageSize: request.pageSize,
    sortColumn: request.sortColumn,
    sortDirection: request.sortDirection,
    search: request.search,
  })
}
