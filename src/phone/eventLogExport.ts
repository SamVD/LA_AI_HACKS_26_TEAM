/** T-315: copy or download the pipeline log from the companion. */

export function formatEventLogCount(count: number): string {
  return `${count} log ${count === 1 ? 'entry' : 'entries'}`
}

export function sessionLogFilename(exportedAtIso?: string): string {
  const stamp = (exportedAtIso ?? new Date().toISOString()).replace(/[:.]/g, '-')
  return `nudge-session-log-${stamp}.json`
}

/** Try clipboard first; returns whether copy succeeded. */
export async function exportSessionLogJson(
  json: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined = typeof navigator !== 'undefined'
    ? navigator.clipboard
    : undefined,
): Promise<'clipboard' | 'download'> {
  if (clipboard) {
    try {
      await clipboard.writeText(json)
      return 'clipboard'
    } catch {
      /* fall through to download */
    }
  }
  downloadSessionLogJson(json)
  return 'download'
}

export function downloadSessionLogJson(json: string, filename?: string): void {
  let name = filename
  if (!name) {
    try {
      const parsed = JSON.parse(json) as { exportedAt?: string }
      name = sessionLogFilename(parsed.exportedAt)
    } catch {
      name = sessionLogFilename()
    }
  }
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
