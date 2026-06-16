<script lang="ts">
  import { onMount } from 'svelte'
  import {
    describeDbBrowserTable,
    listDbBrowserTables,
    queryAllDbBrowserRowsInChunks,
    queryDbBrowserRows,
  } from '$lib/db-browser'
  import { exportCollectionToJson } from '$lib/export'

  let selectedTable = $state('')
  let columns = $state<Array<{ name: string }>>([])

  onMount(async () => {
    const tables = await listDbBrowserTables()
    selectedTable = tables[0]?.name ?? ''
    if (!selectedTable) return
    columns = await describeDbBrowserTable(selectedTable)
    await queryDbBrowserRows({
      table: selectedTable,
      page: 1,
      pageSize: 25,
      sortColumn: '',
      sortDirection: 'asc',
      search: undefined,
    })
  })

  async function exportTable() {
    const response = await queryAllDbBrowserRowsInChunks({
      table: selectedTable,
      sortColumn: '',
      sortDirection: 'asc',
      search: undefined,
    })
    await exportCollectionToJson(
      {
        table: selectedTable,
        scope: 'full_table',
        rows: response.rows,
      },
      `${selectedTable}.json`
    )
  }
</script>

<section>
  <span>Base de datos</span>
  <h1>Consulta DB</h1>
  {#if selectedTable}
    <span>{selectedTable} · {columns.length} columnas</span>
  {/if}
  <label for="db-browser-table-select">Tabla</label>
  <select id="db-browser-table-select" bind:value={selectedTable}>
    {#if selectedTable}
      <option value={selectedTable}>{selectedTable}</option>
    {/if}
  </select>
</section>

{#if selectedTable}
  <button type="button" aria-label="Descargar JSON" onclick={exportTable}>Descargar JSON</button>
  <p>Esta tabla no tiene filas para mostrar.</p>
{/if}
