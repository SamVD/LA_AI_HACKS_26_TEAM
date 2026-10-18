import { afterEach, expect, it, vi } from 'vitest'

type Envelope = { eventType?: number }
type HubEvent = { sysEvent?: Envelope; textEvent?: Envelope; audioEvent?: object }
const mock = vi.hoisted(() => ({
  listener: undefined as undefined | ((event: HubEvent) => void),
  unsubscribe: vi.fn(),
  bridge: {
    createStartUpPageContainer: vi.fn().mockResolvedValue(0),
    textContainerUpgrade: vi.fn().mockResolvedValue(0),
    shutDownPageContainer: vi.fn().mockResolvedValue(0),
    onEvenHubEvent: vi.fn(),
  },
}))
vi.mock('@evenrealities/even_hub_sdk', () => {
  class Property {
    constructor(data: object) { Object.assign(this, data) }
  }
  return {
    waitForEvenAppBridge: async () => mock.bridge,
    TextContainerProperty: Property,
    CreateStartUpPageContainer: Property,
    TextContainerUpgrade: Property,
    OsEventTypeList: { CLICK_EVENT: 0, DOUBLE_CLICK_EVENT: 1, SYSTEM_EXIT_EVENT: 2, ABNORMAL_EXIT_EVENT: 3 },
  }
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('keeps the hello screen, logs the initial mode, counts taps and handles root exit', async () => {
  vi.stubGlobal('window', { addEventListener: vi.fn() })
  const log = vi.spyOn(console, 'log').mockImplementation(() => {})
  mock.bridge.onEvenHubEvent.mockImplementation((listener: (event: HubEvent) => void) => {
    mock.listener = listener
    return mock.unsubscribe
  })
  await import('../main')
  expect(mock.bridge.createStartUpPageContainer).toHaveBeenCalledWith(expect.objectContaining({
    containerTotalNum: 1,
    textObject: [expect.objectContaining({ content: 'Hello Nudge\nTap to count · double-tap to exit.' })],
  }))
  expect(log).toHaveBeenCalledWith('[nudge:screen]', { kind: 'status', text: 'step1 not built yet' })
  mock.listener?.({ audioEvent: {} })
  expect(mock.bridge.textContainerUpgrade).not.toHaveBeenCalled()
  mock.listener?.({ sysEvent: {} }) // Omitted protobuf zero is a click.
  expect(mock.bridge.textContainerUpgrade).toHaveBeenCalledWith(expect.objectContaining({
    content: 'Taps: 1\nTap to count · double-tap to exit.',
  }))
  mock.listener?.({ textEvent: { eventType: 1 } })
  expect(mock.bridge.shutDownPageContainer).toHaveBeenCalledWith(1)
  mock.listener?.({ sysEvent: { eventType: 2 } })
  expect(mock.unsubscribe).toHaveBeenCalledOnce()
})
