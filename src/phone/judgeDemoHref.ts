/** URL for the T-401 judge demo page from the current app origin. */
export function judgeDemoHref(): string {
  return new URL('src/phone/demo/index.html', `${window.location.origin}/`).href
}
