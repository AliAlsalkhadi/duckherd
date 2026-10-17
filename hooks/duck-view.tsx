import type { ClientModule } from 'claude-code'
import { CREATURE_TICK_MS, duckViewRows } from './creatures'
import type { DuckView, Run } from './creatures'

// A duck drawn by the terminal itself: it steps a beat at a time on the surface's frame clock and
// redraws only itself, so the panel around it stays put. It redraws only when its picture
// changes (most frames last two beats or more), so a busy machine paints as little as it can. Its beats
// carry on across the panel's redraws; what the panel last measured (how long quiet, since a note…)
// grows from the beat that drawing arrived.
type Clock = { beat: number; stamp: number; since: number; view: DuckView }

// Each instance's beat, the latest drawing the panel handed it, and the picture it shows, by its surface
// (the same object on every call). The timer reads the latest drawing from here, never from the state it
// last set: a beat landing just after the panel handed over a new one (the other crew, say) would
// otherwise put the old one back, and the two would take turns.
const ticking = new WeakMap<object, { beat: number; clock: Clock; shown?: Run[][] }>()

const rowsAt = (c: Clock, beat: number) => duckViewRows(c.view, beat * CREATURE_TICK_MS, (beat - c.since) * CREATURE_TICK_MS)

const DuckViewClient: ClientModule<DuckView, Clock> = (v, surface) => {
  const { Box, Text } = surface.elements
  let own = ticking.get(surface)
  if (own === undefined) {
    const first: { beat: number; clock: Clock; shown?: Run[][] } = { beat: 0, clock: { beat: 0, stamp: v.stamp, since: 0, view: v } }
    own = first
    ticking.set(surface, first)
    surface.every(CREATURE_TICK_MS, () => {
      if (first.clock.view.isStill) return
      first.beat += 1
      // A beat that draws the same picture leaves the screen alone.
      const next = { ...first.clock, beat: first.beat }
      if (rowsAt(next, first.beat) !== first.shown) {
        first.clock = next
        surface.setState(next)
      }
    })
    surface.setState(first.clock)
  } else if (own.clock.stamp !== v.stamp) {
    own.clock = { ...own.clock, beat: own.beat, stamp: v.stamp, since: own.beat, view: v }
    surface.setState(own.clock)
  }
  const clock = own.clock
  const rows = rowsAt(clock, clock.beat)
  own.shown = rows

  return (
    <Box flexDirection="column">
      {rows.map((runs, r) => (
        <Box key={`r${r}`} flexDirection="row">
          {runs.map((run, j) => (
            <Text key={`c${j}`} {...(run.color !== undefined ? { color: run.color } : {})} {...(run.backgroundColor !== undefined ? { backgroundColor: run.backgroundColor } : {})}>
              {run.text}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}

export default DuckViewClient
