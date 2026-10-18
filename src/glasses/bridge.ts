// The only module in src/glasses/ that builds SDK objects. Everything else talks
// to the plain HubBridge interface, so tests run against a fake.
import {
  CreateStartUpPageContainer,
  ImageContainerProperty,
  ImageRawDataUpdate,
  RebuildPageContainer,
  TextContainerProperty,
  TextContainerUpgrade,
  type EvenAppBridge,
  type EvenHubEvent,
} from '@evenrealities/even_hub_sdk'
import type { PageSpec } from './layout'

export interface HubBridge {
  /** createStartUpPageContainer; call exactly once. Resolves true on success. */
  createPage(page: PageSpec): Promise<boolean>
  rebuildPage(page: PageSpec): Promise<boolean>
  upgradeText(id: number, name: string, content: string): Promise<boolean>
  /** Resolves true when the glasses accepted the image. */
  sendImage(id: number, name: string, png: Uint8Array): Promise<boolean>
  /** shutDownPageContainer(1): the system exit dialog. The user may cancel. */
  exitDialog(): Promise<void>
  onEvent(cb: (event: EvenHubEvent) => void): () => void
  getItem(key: string): Promise<string>
  setItem(key: string, value: string): Promise<boolean>
}

export type Log = (event: string, data?: unknown) => void

/**
 * Runs async calls one at a time. The docs warn that concurrent bridge calls can
 * drop the connection and a bad BLE hop can hang ~30 s, so each call gets a
 * timeout; on timeout we log, resolve `fallback`, and let the queue move on.
 */
export function createSerialQueue(timeoutMs: number, log: Log) {
  let tail: Promise<unknown> = Promise.resolve()
  return function run<T>(name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
    const call = async (): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          fn(),
          new Promise<T>(resolve => {
            timer = setTimeout(() => { log('bridge timeout', { name, timeoutMs }); resolve(fallback) }, timeoutMs)
          }),
        ])
      } catch (err) {
        log('bridge error', { name, error: String(err) })
        return fallback
      } finally {
        clearTimeout(timer)
      }
    }
    const result = tail.then(call, call)
    tail = result
    return result
  }
}

function toSdk(page: PageSpec) {
  const textObject = page.texts.map(t => new TextContainerProperty({
    xPosition: t.x, yPosition: t.y, width: t.w, height: t.h,
    borderWidth: 0, borderColor: 0, paddingLength: 0,
    containerID: t.id, containerName: t.name, content: t.content,
    isEventCapture: t.capture ? 1 : 0,
  }))
  const imageObject = page.images.map(i => new ImageContainerProperty({
    xPosition: i.x, yPosition: i.y, width: i.w, height: i.h,
    containerID: i.id, containerName: i.name,
  }))
  return {
    containerTotalNum: textObject.length + imageObject.length,
    textObject,
    ...(imageObject.length ? { imageObject } : {}),
  }
}

export function createHubBridge(bridge: EvenAppBridge, log: Log, timeoutMs = 5000): HubBridge {
  const run = createSerialQueue(timeoutMs, log)
  return {
    createPage: page => run('createStartUpPageContainer', async () => {
      const result = await bridge.createStartUpPageContainer(new CreateStartUpPageContainer(toSdk(page)))
      if (result !== 0) log('createStartUpPageContainer failed', { result })
      return result === 0
    }, false),
    rebuildPage: page => run('rebuildPageContainer', () => bridge.rebuildPageContainer(new RebuildPageContainer(toSdk(page))), false),
    upgradeText: (id, name, content) => run('textContainerUpgrade', () => bridge.textContainerUpgrade(new TextContainerUpgrade({
      containerID: id, containerName: name, contentOffset: 0, contentLength: 0, content,
    })), false),
    sendImage: (id, name, png) => run('updateImageRawData', async () => {
      const result = await bridge.updateImageRawData(new ImageRawDataUpdate({ containerID: id, containerName: name, imageData: png }))
      if (String(result) !== 'success') log('updateImageRawData failed', { name, result })
      return String(result) === 'success'
    }, false),
    exitDialog: async () => { await run('shutDownPageContainer', () => bridge.shutDownPageContainer(1), false) },
    onEvent: cb => bridge.onEvenHubEvent(cb),
    getItem: key => run('getLocalStorage', () => bridge.getLocalStorage(key), ''),
    setItem: (key, value) => run('setLocalStorage', () => bridge.setLocalStorage(key, value), false),
  }
}
