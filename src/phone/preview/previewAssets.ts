import { getImage } from '../../content'
import type { Screen } from '../../core/types'
import { collectImageKeys } from './collectImageKeys'

const urlByKey = new Map<string, string>()

export function previewImageUrl(key: string): string | null {
  return urlByKey.get(key) ?? null
}

/** Rasterize and cache object URLs for keys on this screen (no-op in Node). */
export async function ensurePreviewImages(screen: Screen | null): Promise<void> {
  if (!screen || typeof Image === 'undefined') return
  await Promise.all(
    collectImageKeys(screen).map(async key => {
      if (urlByKey.has(key)) return
      const img = await getImage(key, 200, 120)
      if (!img) return
      const bytes = new Uint8Array(img.png)
      const blob = new Blob([bytes], { type: 'image/png' })
      urlByKey.set(key, URL.createObjectURL(blob))
    }),
  )
}

export function renderPreviewOptions() {
  return { imageUrl: previewImageUrl }
}
