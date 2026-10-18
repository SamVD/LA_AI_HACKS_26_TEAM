// Generated from docs/PREDICTOR_PROMPT.md (prompt version 2). Do not edit by hand:
// _prompt.test.ts fails if this drifts from the doc. To update, change the doc (ORCH),
// then regenerate: node api/predict/_gen-prompt.mjs

export const PROMPT_VERSION = 2

/** Section 3, verbatim. */
export const SYSTEM_PROMPT = "You help a person with aphasia find a word they are stuck on during a conversation. They know what they want to say but cannot retrieve the word.\n\nYou receive JSON with:\n- \"transcript\": what was said recently. The person stalled at the [STALL] marker at the end.\n- \"stalledAfter\": the last words they said before stalling.\n- \"bank\": their personal word list. Each entry has a word, a category, and tags. Names, medications and places in it are people and things they care about.\n- \"place\": where they are right now (optional).\n- \"n\": how many suggestions to return.\n\nReturn the n words they are most likely trying to say at [STALL], most likely first.\n\nRules:\n1. Suggest the single word that fills the gap, usually a noun: an object, food, place, person's name, or medication. Use a verb or adjective only when the grammar clearly needs one. A two-word item is fine only when it is one thing (\"ice cream\", \"living room\").\n2. Never suggest filler or function words (um, uh, the, a, and, like, with, but, or, it, that, thing, stuff) or a word that just repeats the last word said.\n3. Treat these as strong clues:\n   - Circumlocution: \"the thing you cut with\" means knife or scissors.\n   - Near-miss sounds: \"cop\" or \"cuh\" probably means cup; a partial word is a strong clue to the first sound.\n   - Wrong word in the same category: \"fork, no, the...\" means a related utensil.\n   - Earlier mentions: a topic or name from earlier in the transcript is likely to come up again.\n4. Prefer a word from the bank when it fits the context about as well as a general word. Copy bank words exactly as written, including capitals. Do not force a bank word that does not fit.\n5. Use \"place\" only as a tie-breaker.\n6. The suggestions should be different words, not variants of one word (cup, mug, glass is fine; cup, cups, a cup is not). Never return both a word and its plural.\n7. Confidence is your probability, from 0 to 1, that this exact word is the one they want. The values do not need to sum to 1. Use low numbers when the context is vague.\n\nOutput only a JSON array of objects with \"word\" and \"confidence\". No explanation."

/** Section 5. */
export const RESPONSE_SCHEMA = {
  "type": "ARRAY",
  "maxItems": 5,
  "items": {
    "type": "OBJECT",
    "properties": {
      "word": {
        "type": "STRING"
      },
      "confidence": {
        "type": "NUMBER"
      }
    },
    "required": [
      "word",
      "confidence"
    ],
    "propertyOrdering": [
      "word",
      "confidence"
    ]
  }
}

/** Section 8, Examples 1-7, sent as few-shot turns (Section 2). */
export const EXAMPLES: ReadonlyArray<{ input: unknown; output: unknown }> = [
  {
    "input": {
      "transcript": "I'm so thirsty. Can you pass me the [STALL]",
      "stalledAfter": "pass me the",
      "bank": [
        {
          "word": "cup",
          "category": "object",
          "tags": [
            "kitchen",
            "drink"
          ]
        },
        {
          "word": "water",
          "category": "food",
          "tags": [
            "drink"
          ]
        },
        {
          "word": "spoon",
          "category": "object",
          "tags": [
            "kitchen"
          ]
        }
      ],
      "n": 3
    },
    "output": [
      {
        "word": "water",
        "confidence": 0.45
      },
      {
        "word": "cup",
        "confidence": 0.3
      },
      {
        "word": "glass",
        "confidence": 0.15
      }
    ]
  },
  {
    "input": {
      "transcript": "Every morning after breakfast I take my, um, my [STALL]",
      "stalledAfter": "I take my, um, my",
      "bank": [
        {
          "word": "Lisinopril",
          "category": "medication",
          "tags": [
            "morning",
            "blood pressure",
            "sample"
          ]
        },
        {
          "word": "coffee",
          "category": "food",
          "tags": [
            "morning",
            "drink"
          ]
        },
        {
          "word": "Maya",
          "category": "person",
          "tags": [
            "family",
            "daughter",
            "sample"
          ]
        }
      ],
      "n": 3
    },
    "output": [
      {
        "word": "Lisinopril",
        "confidence": 0.6
      },
      {
        "word": "pills",
        "confidence": 0.2
      },
      {
        "word": "medicine",
        "confidence": 0.1
      }
    ]
  },
  {
    "input": {
      "transcript": "We went to the park on Sunday with my daughter, uh, with [STALL]",
      "stalledAfter": "my daughter, uh, with",
      "bank": [
        {
          "word": "Maya",
          "category": "person",
          "tags": [
            "family",
            "daughter",
            "sample"
          ]
        },
        {
          "word": "Dr. Patel",
          "category": "person",
          "tags": [
            "doctor",
            "sample"
          ]
        },
        {
          "word": "park",
          "category": "place",
          "tags": [
            "outside"
          ]
        }
      ],
      "n": 3
    },
    "output": [
      {
        "word": "Maya",
        "confidence": 0.8
      },
      {
        "word": "grandkids",
        "confidence": 0.05
      },
      {
        "word": "dog",
        "confidence": 0.05
      }
    ]
  },
  {
    "input": {
      "transcript": "This soup smells great. Can I have a fork, no, not a fork, the, the [STALL]",
      "stalledAfter": "not a fork, the, the",
      "bank": [
        {
          "word": "spoon",
          "category": "object",
          "tags": [
            "kitchen",
            "eat"
          ]
        },
        {
          "word": "fork",
          "category": "object",
          "tags": [
            "kitchen",
            "eat"
          ]
        },
        {
          "word": "knife",
          "category": "object",
          "tags": [
            "kitchen"
          ]
        }
      ],
      "n": 3
    },
    "output": [
      {
        "word": "spoon",
        "confidence": 0.85
      },
      {
        "word": "ladle",
        "confidence": 0.07
      },
      {
        "word": "bowl",
        "confidence": 0.05
      }
    ]
  },
  {
    "input": {
      "transcript": "I would love some tea. Can I have a cop, a, a cuh [STALL]",
      "stalledAfter": "a, a cuh",
      "bank": [
        {
          "word": "cup",
          "category": "object",
          "tags": [
            "kitchen",
            "drink"
          ]
        },
        {
          "word": "tea",
          "category": "food",
          "tags": [
            "drink"
          ]
        },
        {
          "word": "cake",
          "category": "food",
          "tags": [
            "dessert"
          ]
        }
      ],
      "n": 3
    },
    "output": [
      {
        "word": "cup",
        "confidence": 0.85
      },
      {
        "word": "mug",
        "confidence": 0.08
      },
      {
        "word": "pot",
        "confidence": 0.04
      }
    ]
  },
  {
    "input": {
      "transcript": "The car is making that noise again. I need to take it to the, you know, the guy who fixes it, the [STALL]",
      "stalledAfter": "who fixes it, the",
      "bank": [
        {
          "word": "Ralphs",
          "category": "place",
          "tags": [
            "shopping",
            "food",
            "sample"
          ]
        },
        {
          "word": "keys",
          "category": "object",
          "tags": [
            "house",
            "car"
          ]
        }
      ],
      "n": 3
    },
    "output": [
      {
        "word": "mechanic",
        "confidence": 0.7
      },
      {
        "word": "garage",
        "confidence": 0.15
      },
      {
        "word": "shop",
        "confidence": 0.08
      }
    ]
  },
  {
    "input": {
      "transcript": "Okay we still need to get some [STALL]",
      "stalledAfter": "need to get some",
      "bank": [
        {
          "word": "milk",
          "category": "food",
          "tags": [
            "breakfast",
            "fridge"
          ]
        },
        {
          "word": "bread",
          "category": "food",
          "tags": [
            "breakfast"
          ]
        },
        {
          "word": "stamps",
          "category": "object",
          "tags": [
            "post office"
          ]
        }
      ],
      "place": "Ralphs supermarket",
      "n": 3
    },
    "output": [
      {
        "word": "milk",
        "confidence": 0.25
      },
      {
        "word": "bread",
        "confidence": 0.2
      },
      {
        "word": "eggs",
        "confidence": 0.12
      }
    ]
  }
]
