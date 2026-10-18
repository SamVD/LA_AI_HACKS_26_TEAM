/** Shared with T-004's JSON fixtures. Event times are offsets from replay start. */
export interface ConversationFixture {
  id: string
  description: string
  events: Array<
    | { tMs: number; type: 'speech'; speaking: boolean }
    | { tMs: number; type: 'transcript'; text: string; isFinal: boolean; tStartMs: number }
  >
  stalls: Array<{
    tMs: number
    stalledAfter: string
    intendedWord: string
    expectedTop3: string[]
    inBank: boolean
  }>
}
