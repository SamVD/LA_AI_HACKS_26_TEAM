import { describe, expect, it, vi } from 'vitest'
import { exportSessionLogJson, formatEventLogCount, sessionLogFilename } from './eventLogExport'

describe('eventLogExport (T-315)', () => {
  it('formats entry count', () => {
    expect(formatEventLogCount(0)).toBe('0 log entries')
    expect(formatEventLogCount(1)).toBe('1 log entry')
    expect(formatEventLogCount(3)).toBe('3 log entries')
  })

  it('builds a safe download filename', () => {
    expect(sessionLogFilename('2026-10-18T12:34:56.789Z')).toMatch(/^nudge-session-log-2026-10-18T12-34-56/)
  })

  it('copies via clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const result = await exportSessionLogJson('{"ok":true}', { writeText })
    expect(result).toBe('clipboard')
    expect(writeText).toHaveBeenCalledWith('{"ok":true}')
  })
})
