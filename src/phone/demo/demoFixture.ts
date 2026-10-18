import type { ConversationFixture } from '../../mocks/fixtures'
import cleanStall from '../../../fixtures/conversations/clean-stall.json'

/** Primary scripted stall for the judge demo (cup). */
export const judgeConversation = cleanStall as ConversationFixture

export const primaryStall = judgeConversation.stalls[0]

export function suggestionsForStall(stall: ConversationFixture['stalls'][number]) {
  return stall.expectedTop3.map((word, index) => ({
    word,
    confidence: Math.max(0.35, 0.92 - index * 0.18),
    imageKey: word === 'cup' ? 'cup' : undefined,
    source: 'bank' as const,
  }))
}
