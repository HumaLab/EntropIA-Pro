import { render, screen, fireEvent, waitFor } from '@testing-library/svelte'
import { describe, it, expect, vi } from 'vitest'
import EntityViewer from '../EntityViewer.svelte'
import type { Entity, EntityViewerProps } from '../EntityViewer.types'

const makeEntity = (overrides: Partial<Entity> = {}): Entity => ({
  id: 'ent-1',
  itemId: 'item-1',
  entityType: 'person',
  value: 'Don Manuel Belgrano',
  startOffset: 0,
  endOffset: 19,
  confidence: 1.0,
  createdAt: 1700000000000,
  ...overrides,
})

describe('EntityViewer', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Empty state
  // ─────────────────────────────────────────────────────────────────────────

  it('shows empty state message when entities array is empty', () => {
    render(EntityViewer, { props: { entities: [] } })
    expect(screen.getByTestId('entity-viewer-empty')).toBeInTheDocument()
  })

  it('does not render any group sections when entities is empty', () => {
    render(EntityViewer, { props: { entities: [] } })
    expect(screen.queryByTestId('entity-group')).not.toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Grouped rendering
  // ─────────────────────────────────────────────────────────────────────────

  it('renders 3 group sections for 2 PERSON + 1 PLACE + 1 DATE', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'e1', entityType: 'person', value: 'Don Manuel Belgrano' }),
      makeEntity({ id: 'e2', entityType: 'person', value: 'Doña Juana Azurduy' }),
      makeEntity({ id: 'e3', entityType: 'place', value: 'ciudad de Buenos Aires' }),
      makeEntity({ id: 'e4', entityType: 'date', value: '15 de mayo de 1810' }),
    ]
    render(EntityViewer, { props: { entities } })
    const groups = screen.getAllByTestId('entity-group')
    expect(groups).toHaveLength(3)
  })

  it('renders group labels for detected entity types', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'e1', entityType: 'person', value: 'Fray Bartolomé' }),
      makeEntity({ id: 'e2', entityType: 'institution', value: 'Cabildo' }),
    ]
    render(EntityViewer, { props: { entities } })
    expect(screen.getByText(/person/i)).toBeInTheDocument()
    expect(screen.getByText(/institution/i)).toBeInTheDocument()
  })

  it('renders all entity values as pills', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'e1', entityType: 'person', value: 'Don Manuel Belgrano' }),
      makeEntity({ id: 'e2', entityType: 'place', value: 'ciudad de Buenos Aires' }),
    ]
    render(EntityViewer, { props: { entities } })
    expect(screen.getByText('Don Manuel Belgrano')).toBeInTheDocument()
    expect(screen.getByText('ciudad de Buenos Aires')).toBeInTheDocument()
  })

  it('renders all 4 entity type groups when all types present', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'e1', entityType: 'person', value: 'Don Pedro' }),
      makeEntity({ id: 'e2', entityType: 'place', value: 'villa de Potosí' }),
      makeEntity({ id: 'e3', entityType: 'date', value: '12 de octubre de 1492' }),
      makeEntity({ id: 'e4', entityType: 'institution', value: 'Real Audiencia' }),
    ]
    render(EntityViewer, { props: { entities } })
    const groups = screen.getAllByTestId('entity-group')
    expect(groups).toHaveLength(4)
  })

  it('renders only PLACE entities in a place group', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'p1', entityType: 'place', value: 'río de la Plata' }),
      makeEntity({ id: 'p2', entityType: 'place', value: 'ciudad de Córdoba' }),
    ]
    render(EntityViewer, { props: { entities } })
    expect(screen.getByText('río de la Plata')).toBeInTheDocument()
    expect(screen.getByText('ciudad de Córdoba')).toBeInTheDocument()
    const groups = screen.getAllByTestId('entity-group')
    expect(groups).toHaveLength(1)
  })

  it('renders only DATE entities in a date group', () => {
    const entities: Entity[] = [makeEntity({ id: 'd1', entityType: 'date', value: '25/05/1810' })]
    render(EntityViewer, { props: { entities } })
    expect(screen.getByText('25/05/1810')).toBeInTheDocument()
    const groups = screen.getAllByTestId('entity-group')
    expect(groups).toHaveLength(1)
  })

  it('renders only INSTITUTION entities in an institution group', () => {
    const entities: Entity[] = [
      makeEntity({ id: 'i1', entityType: 'institution', value: 'Real Audiencia' }),
    ]
    render(EntityViewer, { props: { entities } })
    expect(screen.getByText('Real Audiencia')).toBeInTheDocument()
    const groups = screen.getAllByTestId('entity-group')
    expect(groups).toHaveLength(1)
  })

  it('shows NER tag on entity pill instead of confidence percentage', () => {
    const entity = makeEntity({
      id: 'c1',
      entityType: 'person',
      value: 'Don Manuel',
      confidence: 0.85,
    })
    render(EntityViewer, { props: { entities: [entity] } })
    expect(screen.getByText('PER')).toBeInTheDocument()
    expect(screen.queryByTestId('entity-confidence')).not.toBeInTheDocument()
  })

  it('renders organization entities in their own group', () => {
    const entity = makeEntity({
      id: 'c2',
      entityType: 'organization',
      value: 'Wilson Sons y Cía.',
      confidence: 1.0,
    })
    render(EntityViewer, { props: { entities: [entity] } })
    expect(screen.getByText(/organization/i)).toBeInTheDocument()
    expect(screen.getByText('ORG')).toBeInTheDocument()
  })

  // ─────────────────────────────────────────────────────────────────────────
  // Click dispatches highlight event
  // ─────────────────────────────────────────────────────────────────────────

  it('clicking an entity pill calls onhighlight with correct offsets', async () => {
    const onhighlight = vi.fn()
    const entity = makeEntity({ startOffset: 10, endOffset: 30, value: 'Don Manuel Belgrano' })
    render(EntityViewer, { props: { entities: [entity], onhighlight } })

    const pill = screen.getByText('Don Manuel Belgrano')
    await fireEvent.click(pill)

    expect(onhighlight).toHaveBeenCalledOnce()
    expect(onhighlight).toHaveBeenCalledWith({ startOffset: 10, endOffset: 30 })
  })

  it('does not call onhighlight when entity has null offsets', async () => {
    const onhighlight = vi.fn()
    const entity = makeEntity({ startOffset: null, endOffset: null, value: 'Sin offset' })
    render(EntityViewer, { props: { entities: [entity], onhighlight } })

    const pill = screen.getByText('Sin offset')
    await fireEvent.click(pill)

    expect(onhighlight).not.toHaveBeenCalled()
  })

  it('clicking an entity pill calls onentityclick with the entity', async () => {
    const onentityclick = vi.fn()
    const entity = makeEntity({ id: 'e-click', value: 'Mar del Plata' })
    render(EntityViewer, { props: { entities: [entity], onentityclick } })

    await fireEvent.click(screen.getByText('Mar del Plata'))

    expect(onentityclick).toHaveBeenCalledOnce()
    expect(onentityclick).toHaveBeenCalledWith(expect.objectContaining({ id: 'e-click' }))
  })

  it('enters inline edit mode when clicking a chip', async () => {
    const props: EntityViewerProps = {
      entities: [makeEntity({ id: 'entity-inline', value: 'Mar del Plata' })],
      editingEntityId: null,
      editingValue: '',
    }

    const view = render(EntityViewer, { props })

    props.onentityclick = async (entity: Entity) => {
      props.editingEntityId = entity.id
      props.editingValue = entity.value
      await view.rerender(props)
    }

    await view.rerender(props)
    await fireEvent.click(screen.getByRole('button', { name: /Mar del Plata/i }))

    expect(await screen.findByDisplayValue('Mar del Plata')).toBeInTheDocument()
  })

  it('shows the current entity value inside the inline input', () => {
    render(EntityViewer, {
      props: {
        entities: [makeEntity({ id: 'entity-current', value: 'Belgrano' })],
        editingEntityId: 'entity-current',
        editingValue: 'Belgrano',
      },
    })

    expect(screen.getByRole('textbox', { name: 'Edit entity value' })).toHaveValue('Belgrano')
  })

  it('pressing Enter triggers save callback with trimmed value', async () => {
    const onsaveentity = vi.fn()
    const oneditvaluechange = vi.fn()

    render(EntityViewer, {
      props: {
        entities: [makeEntity({ id: 'entity-save', value: 'Belgrano' })],
        editingEntityId: 'entity-save',
        editingValue: '  Belgrano renovado  ',
        onsaveentity,
        oneditvaluechange,
      },
    })

    const input = screen.getByRole('textbox', { name: 'Edit entity value' })
    await fireEvent.keyDown(input, { key: 'Enter' })

    expect(onsaveentity).toHaveBeenCalledWith('entity-save', 'Belgrano renovado')
    expect(oneditvaluechange).not.toHaveBeenCalled()
  })

  it('pressing Escape cancels inline editing', async () => {
    const oncancelentityedit = vi.fn()

    render(EntityViewer, {
      props: {
        entities: [makeEntity({ id: 'entity-cancel', value: 'Belgrano' })],
        editingEntityId: 'entity-cancel',
        editingValue: 'Belgrano editado',
        oncancelentityedit,
      },
    })

    await fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit entity value' }), {
      key: 'Escape',
    })

    expect(oncancelentityedit).toHaveBeenCalledOnce()
  })

  it('requires inline delete confirmation before triggering delete callback', async () => {
    const ondeleteentity = vi.fn()

    render(EntityViewer, {
      props: {
        entities: [makeEntity({ id: 'entity-delete', value: 'Belgrano' })],
        ondeleteentity,
      },
    })

    expect(screen.queryByRole('button', { name: 'Delete entity Belgrano' })).not.toBeInTheDocument()

    await fireEvent.mouseEnter(screen.getByTestId('entity-chip-entity-delete'))

    const deleteButton = await screen.findByRole('button', { name: 'Delete entity Belgrano' })
    await fireEvent.click(deleteButton)

    expect(ondeleteentity).not.toHaveBeenCalled()

    const confirmButton = await screen.findByRole('button', {
      name: 'Confirm delete entity Belgrano',
    })
    expect(confirmButton).toHaveTextContent('Delete?')
    expect(confirmButton).toHaveAttribute('title', 'Press again to confirm delete')
    await fireEvent.click(confirmButton)

    expect(ondeleteentity).toHaveBeenCalledWith('entity-delete')
  })

  it('supports keyboard-first delete confirmation without breaking inline edit affordances', async () => {
    const ondeleteentity = vi.fn()

    render(EntityViewer, {
      props: {
        entities: [makeEntity({ id: 'entity-delete-keyboard', value: 'Belgrano' })],
        ondeleteentity,
      },
    })

    const pill = screen.getByRole('button', { name: /Belgrano/i })

    await fireEvent.focusIn(pill)

    const deleteButton = await screen.findByRole('button', { name: 'Delete entity Belgrano' })
    await fireEvent.keyDown(deleteButton, { key: 'Enter' })

    expect(ondeleteentity).not.toHaveBeenCalled()
    const confirmButton = await screen.findByRole('button', {
      name: 'Confirm delete entity Belgrano',
    })
    expect(confirmButton).toHaveTextContent('Delete?')

    await fireEvent.keyDown(confirmButton, { key: 'Enter' })

    expect(ondeleteentity).toHaveBeenCalledWith('entity-delete-keyboard')
  })

  it('blur saves changed non-empty values and cancels unchanged ones', async () => {
    const onsaveentity = vi.fn()
    const oncancelentityedit = vi.fn()
    const props: EntityViewerProps = {
      entities: [makeEntity({ id: 'entity-blur', value: 'Belgrano' })],
      editingEntityId: 'entity-blur',
      editingValue: '  Belgrano actualizado  ',
      onsaveentity,
      oncancelentityedit,
    }

    const view = render(EntityViewer, { props })
    const input = screen.getByRole('textbox', { name: 'Edit entity value' })

    await fireEvent.blur(input)

    expect(onsaveentity).toHaveBeenCalledWith('entity-blur', 'Belgrano actualizado')
    expect(oncancelentityedit).not.toHaveBeenCalled()

    props.editingValue = '   '
    onsaveentity.mockClear()
    await view.rerender(props)
    await fireEvent.blur(screen.getByRole('textbox', { name: 'Edit entity value' }))

    await waitFor(() => {
      expect(oncancelentityedit).toHaveBeenCalledOnce()
    })
    expect(onsaveentity).not.toHaveBeenCalled()
  })
})
