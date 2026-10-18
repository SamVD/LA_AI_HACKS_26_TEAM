/// <reference types="vite/client" />
import type { GreyImage, ImageSource, WordEntry } from '../core/types'
import { mouthKeyFor as resolveMouthKey } from './phonetics'
import words from './words.json'

const svgFiles = import.meta.glob<string>('./assets/**/*.svg', { query: '?raw', import: 'default' })
const sources = new Map<string, () => Promise<string>>()
for (const [path, loader] of Object.entries(svgFiles)) {
  const match = path.match(/^\.\/assets\/(pictures|mouth)\/([^/]+)\.svg$/)
  if (match) sources.set(`${match[1] === 'mouth' ? 'mouth:' : ''}${match[2]}`, loader)
}

export function builtinBank(): WordEntry[] {
  return structuredClone(words as WordEntry[])
}

/** Mouth cue for a word; firstSound overrides names and exceptions. */
export function mouthKeyFor(entry: WordEntry): string | undefined {
  return resolveMouthKey(entry.word, entry.firstSound)
}

export function resolveAssets(entry: WordEntry): { imageKey?: string; mouthKey?: string } {
  const key = entry.imageKey ?? entry.id
  return {
    imageKey: !key.startsWith('mouth:') && sources.has(key) ? key : undefined,
    mouthKey: mouthKeyFor(entry),
  }
}

const cache = new Map<string, Promise<GreyImage | null>>()
const dimension = (value: number, max: number) => Math.round(Math.max(20, Math.min(max, Number.isNaN(value) ? 20 : value)))

function loadImage(svg: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const image = new Image()
    const finish = (value: HTMLImageElement | null) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), 5000)
    image.onload = () => finish(image)
    image.onerror = () => finish(null)
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}

async function rasterize(key: string, width: number, height: number): Promise<GreyImage | null> {
  const svg = await sources.get(key)!()
  const box = svg.match(/viewBox="([\d. -]+)"/)?.[1].trim().split(/\s+/).map(Number)
  if (!box || box.length !== 4 || !(box[2] > 0 && box[3] > 0)) return null
  // Explicit intrinsic dimensions prevent SVG default sizing from distorting
  // the viewBox when the image is drawn into a differently shaped container.
  const image = await loadImage(svg.replace('<svg ', `<svg width="${box[2]}" height="${box[3]}" `))
  if (!image) return null
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) :
    Object.assign(document.createElement('canvas'), { width, height })
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
  if (!context) return null
  context.fillStyle = '#000'
  context.fillRect(0, 0, width, height)
  const scale = Math.min((width - 16) / box[2], (height - 16) / box[3])
  const w = box[2] * scale
  const h = box[3] * scale
  context.drawImage(image, (width - w) / 2, (height - h) / 2, w, h)
  const blob = 'convertToBlob' in canvas ? await canvas.convertToBlob({ type: 'image/png' }) :
    await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  return blob ? { key, width, height, png: new Uint8Array(await blob.arrayBuffer()) } : null
}

/** Safe in Node and on failed canvas/image support. Cached by key and clamped size. */
export const getImage: ImageSource = async (key, requestedWidth, requestedHeight) => {
  if (!sources.has(key) || typeof Image === 'undefined' ||
      (typeof document === 'undefined' && typeof OffscreenCanvas === 'undefined')) return null
  const width = dimension(requestedWidth, 288)
  const height = dimension(requestedHeight, 144)
  const cacheKey = `${key}:${width}x${height}`
  let pending = cache.get(cacheKey)
  if (!pending) {
    pending = rasterize(key, width, height).catch(() => null)
    cache.set(cacheKey, pending)
    // Keep memory bounded if callers request many image sizes.
    if (cache.size > 64) cache.delete(cache.keys().next().value!)
  }
  const result = await pending
  if (!result && cache.get(cacheKey) === pending) cache.delete(cacheKey)
  return result ? { ...result, png: result.png.slice() } : null
}
