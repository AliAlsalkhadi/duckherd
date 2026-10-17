// A small duck swimming right, in quarter blocks: tail, body, head and bill on one row, 7 cells wide.
// The lead duck's mark on the lesson card in the chat.
export const DUCK_MARK = '▗▄▄▄▟█▘'

// Duck gold: dark enough to read on a light terminal (3:1 on white), bright on the dark panel.
export const LEAD_COLOR = '#BD8C12'
// Helpers never use the lead duck's gold. Fourteen, ordered so helpers next
// to each other never look alike; the fifteenth starts over.
export const HELPER_COLORS = [
  '#4FB6A8', // teal
  '#E07FA8', // pink
  '#8CC765', // lime
  '#6FA0E6', // blue
  '#E8955A', // apricot
  '#C678DD', // purple
  '#56C2E6', // cyan
  '#E06C75', // red
  '#6FD6A8', // mint
  '#8E8CE8', // indigo
  '#C3C95B', // olive
  '#B48CB4', // mauve
  '#F2A2C0', // rose
  '#9AA7B8', // slate
]

// The model each agent runs on has a colour of its own, shown as its name on the card.
const MODEL_COLORS = { haiku: '#7FCFC4', sonnet: '#79A8EB', opus: '#C3A8E8', fable: '#E8B931' } as const

export function modelOf(id: string | undefined): { name: string; color: string } {
  const lower = (id ?? '').toLowerCase()
  if (lower.includes('haiku')) return { name: 'Haiku', color: MODEL_COLORS.haiku }
  if (lower.includes('sonnet')) return { name: 'Sonnet', color: MODEL_COLORS.sonnet }
  if (lower.includes('opus')) return { name: 'Opus', color: MODEL_COLORS.opus }
  if (lower.includes('fable')) return { name: 'Fable', color: MODEL_COLORS.fable }

  return { name: id || 'model', color: '#9AA7B8' }
}


