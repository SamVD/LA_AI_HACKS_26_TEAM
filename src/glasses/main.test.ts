// Startup wiring of src/main.ts with a mocked SDK. Replaces the Phase 0 check in
// src/mocks/startup.test.ts, which tested the old "Hello Nudge" counter.
import { afterEach, expect, it, vi } from 'vitest'

type HubEvent = { sysEvent?: { eventType?: number }; textEvent?: { eventType?: number }; audioEvent?: object }
const mock = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: HubEvent) => void),
  mounted: vi.fn(),
  bridge: {
    createStartUpPageContainer: vi.fn().mockResolvedValue(0),
    rebuildPageContainer: vi.fn().mockResolvedValue(true),
    textContainerUpgrade: vi.fn().mockResolvedValue(true),
    updateImageRawData: vi.fn().mockResolvedValue('success'),
    shutDownPageContainer: vi.fn().mockResolvedValue(true),
    getLocalStorage: vi.fn().mockResolvedValue(''),
    setLocalStorage: vi.fn().mockResolvedValue(true),
    onEvenHubEvent: vi.fn(),
  },
}))
vi.mock('@evenrealities/even_hub_sdk', () => {
  class Property { constructor(data: object) { Object.assign(this, data) } }
  return {
    waitForEvenAppBridge: async () => mock.bridge,
    TextContainerProperty: Property,
    ImageContainerProperty: Property,
    CreateStartUpPageContainer: Property,
    RebuildPageContainer: Property,
    TextContainerUpgrade: Property,
    ImageRawDataUpdate: Property,
  }
})
vi.mock('../phone', () => ({ mountCompanion: mock.mounted }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const settle = () => new Promise(resolve => setTimeout(resolve, 0))
const contentOf = (call: unknown[]) => (call[0] as { textObject: Array<{ content: string }> }).textObject[0].content

it('boots to the launcher, runs the Step 1 stub, returns on double-click and exits from the root', async () => {
  const app = {}
  vi.stubGlobal('document', { getElementById: () => app, addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: 'visible' })
  vi.spyOn(console, 'log').mockImplementation(() => {})
  mock.bridge.onEvenHubEvent.mockImplementation((listener: (event: HubEvent) => void) => {
    mock.listener = listener
    return () => {}
  })
  await import('../main')

  expect(mock.bridge.createStartUpPageContainer).toHaveBeenCalledOnce()
  expect(contentOf(mock.bridge.createStartUpPageContainer.mock.calls[0])).toBe('Nudge\n> Step 1  Practice')
  expect(mock.mounted).toHaveBeenCalledWith(app, expect.objectContaining({ startMode: expect.any(Function) }))

  mock.listener?.({ audioEvent: {} })
  mock.listener?.({ sysEvent: {} }) // Omitted protobuf zero is a click: start Step 1.
  await settle(); await settle()
  expect(contentOf(mock.bridge.rebuildPageContainer.mock.calls.at(-1)!)).toContain('____')

  mock.listener?.({ sysEvent: { eventType: 3 } }) // BACK inside the stub returns to the launcher.
  await settle(); await settle()
  expect(contentOf(mock.bridge.rebuildPageContainer.mock.calls.at(-1)!)).toBe('Nudge\n> Step 1  Practice')
  expect(mock.bridge.shutDownPageContainer).not.toHaveBeenCalled()

  mock.listener?.({ sysEvent: { eventType: 3 } }) // BACK at the launcher opens the exit dialog.
  await settle()
  expect(mock.bridge.shutDownPageContainer).toHaveBeenCalledWith(1)
})
