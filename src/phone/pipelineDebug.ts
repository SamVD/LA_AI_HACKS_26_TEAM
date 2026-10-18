/** T-315: pipeline log export is for testers, not judges (ORCH #103 follow-up). */

export function companionShowsDebugTab(hasDevFeed: boolean, search = ''): boolean {
  if (hasDevFeed) return true
  return new URLSearchParams(search).has('debug')
}
