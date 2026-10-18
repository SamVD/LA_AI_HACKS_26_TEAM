import type { WordCategory, WordEntry } from '../core/types'

const personalCategories = new Set<WordCategory>(['person', 'medication', 'place', 'other'])

export function isPersonalCategory(category: WordCategory): boolean {
  return personalCategories.has(category)
}

export function slugPersonalId(word: string): string {
  const slug = word
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `p-${slug || 'word'}`
}

export function defaultFrameForCategory(category: WordCategory): string {
  switch (category) {
    case 'person':
      return 'This is ____.'
    case 'medication':
      return 'I take ____.'
    case 'place':
      return 'We went to ____.'
    default:
      return 'Say ____.'
  }
}

export function buildPersonalEntry(word: string, category: WordCategory, tags: string[]): WordEntry {
  const trimmed = word.trim()
  return {
    id: slugPersonalId(trimmed),
    word: trimmed,
    category,
    frames: [defaultFrameForCategory(category)],
    tags: tags.length ? tags : ['personal'],
  }
}
