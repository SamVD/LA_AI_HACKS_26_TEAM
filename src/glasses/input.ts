// Touchpad and system events -> Intent / lifecycle signal. Pure, so the mapping
// table is unit-tested without the SDK. Numbers are OsEventTypeList values.
import type { Intent } from '../core/types'

export const CLICK = 0
export const SCROLL_TOP = 1
export const SCROLL_BOTTOM = 2
export const DOUBLE_CLICK = 3
export const FOREGROUND_ENTER = 4
export const FOREGROUND_EXIT = 5
export const ABNORMAL_EXIT = 6
export const SYSTEM_EXIT = 7
export const IMU_DATA_REPORT = 8

interface Envelope { eventType?: number }
export interface HubEventLike {
  sysEvent?: Envelope & { imuData?: unknown }
  textEvent?: Envelope
  listEvent?: unknown
  audioEvent?: unknown
}

export type SystemSignal = 'foreground-enter' | 'foreground-exit' | 'exit'

// Reads the event type out of one envelope.
//
// CLICK_EVENT is 0, and protobuf omits zero-value fields on the wire, so a
// single tap arrives as an envelope whose `eventType` is `undefined`. The
// default has to be resolved INSIDE the envelope check. Writing
// `event.sysEvent?.eventType ?? CLICK_EVENT` instead would read CLICK on
// events that carry no `sysEvent` at all, so every scroll, exit and audio
// frame would fire the tap handler.
function eventTypeOf(envelope?: Envelope): number | null {
  if (!envelope) return null
  return envelope.eventType ?? CLICK
}

// Event routing, critical details:
//   • Taps/double-taps/lifecycle come through `event.sysEvent`.
//     Scroll gestures come through `event.textEvent`. Never mix them.
//   • Check DOUBLE_CLICK before CLICK.
//   • IMU samples also arrive as sysEvent (eventType 8); audio frames and
//     list events are not touchpad input.
export function toIntent(event: HubEventLike): Intent | null {
  if (event.audioEvent || event.listEvent) return null
  const sysType = event.sysEvent?.imuData ? null : eventTypeOf(event.sysEvent)
  const textType = event.textEvent ? event.textEvent.eventType ?? null : null

  if (sysType === DOUBLE_CLICK || textType === DOUBLE_CLICK) return 'BACK'
  if (sysType === CLICK) return 'SELECT'
  if (textType === SCROLL_TOP) return 'PREV'
  if (textType === SCROLL_BOTTOM) return 'NEXT'
  return null
}

export function toSystemSignal(event: HubEventLike): SystemSignal | null {
  const sysType = event.sysEvent?.eventType
  if (sysType === FOREGROUND_ENTER) return 'foreground-enter'
  if (sysType === FOREGROUND_EXIT) return 'foreground-exit'
  if (sysType === SYSTEM_EXIT || sysType === ABNORMAL_EXIT) return 'exit'
  return null
}
