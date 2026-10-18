/** T-315: pipeline log export is for testers, not judges (ORCH #103 follow-up). */

export function companionShowsDebugTab(
  hasDevFeed: boolean,
  search = '',
  debugPack = false,
): boolean {
  if (hasDevFeed || debugPack) return true
  return new URLSearchParams(search).has('debug')
}
