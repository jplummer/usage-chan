# Ten alternative dashboards — plan

Written before drawing, so the reasoning holds still while the code gets built. Amended in place where building proved it wrong; amendments are marked.

## What I am departing from, and what it was buying

The shipped screen is two bottom-anchored vertical columns, fill meaning what is left, the binding window in the wide column, a diamond at even-burn pace with a word naming the gap, a token straddling the bar's end for extra usage, and a three-circle control column on the right.

Four things that layout bought, which I have to either keep or knowingly give up:

1. **Fill means available, everywhere.** One rule, no exceptions, so a bar can never be read backwards. Any layout of mine that uses area has to pick the same convention or say why not.
2. **Colour comes from a relationship, not a level.** `paceColor` fires on unusual days rather than most of them. I keep this function unchanged in every layout, which is the cheapest way to not re-litigate it.
3. **Pace is deterministic.** `elapsed ÷ window_length` never jumps and cannot be wrong. Any layout that draws a projection must draw *that* projection, not a burn-rate estimate.
4. **Geometry explains itself.** The bar's end edge is both exhaustion and reset, which is why the extra-usage token sits on it. Layouts that separate amount from time give this up and have to pay for it in words.

The two things I am most willing to throw out: that the two windows deserve equal-and-adjacent treatment, and that a bar is the form.

## The ten, one line each

1. **Dial** — one circle where the angle you have left is time and the thickness you have left is budget, so the two are one shape.
2. **Tide** — the whole screen is a single draining field, and the waterline is the budget.
3. **Face** — the Stack-Chan reading: two eyes are the two windows, the lids droop as the budget goes, and the mouth carries pace.
4. **Verdict** — one enormous word saying what to do, with every number demoted to marginalia at the screen's edges.
5. **Board** — a departure board: type only, right-aligned, no graphic at all, built to be read from three feet.
6. **Agenda** — everything sorted by when it happens, so the three reset moments become peers and the orphan monthly one finally has a home.
7. **Gap gauge** — a centre-zero needle showing only the distance between spend and pace, on the argument that the level is almost never the news.
8. **Grid** — budget as countable lit cells rather than continuous length, with the 7-day grid's seven columns doing the week dividers' job natively.
9. **Horizon** — both windows on one shared time axis as glide paths, so running out early is visible as a line hitting zero left of its reset tick.
10. **Solo** — the binding window full-bleed, the other one reduced to a line that grows back into a strip only when it is close to binding.

### Range check, before building

Grouped by what the idea actually *is*, to make sure I do not have three of anything:

- Shared time/amount geometry: **Dial** (polar), **Horizon** (cartesian projection). Two, and they are genuinely different reads — Dial is a state, Horizon is a forecast.
- Whole screen as one object: **Tide**. One.
- Typographic, graphic demoted or absent: **Verdict** (one word), **Board** (a table). Two. Verdict carries one bit and hides detail at the edges; Board carries everything at equal weight and hides nothing. Different claims.
- Metaphor / re-framing: **Face** (the shell), **Agenda** (time as the organising axis). Two, unrelated.
- Instrument: **Gap gauge**. One.
- Discrete quantity: **Grid**. One.
- Editorial subtraction: **Solo**. One.

No two survive the same one-sentence description. The weakest pair for distinctness is Verdict and Gap gauge — both lead with the relationship — but Verdict's headline is a *decision* and Gap gauge's is a *measurement*, and Verdict keeps the amounts as marginalia while Gap gauge keeps them as numerals. Keep both; if one dies it will be for that reason and that is a finding.

## Method

One state object, ten renderers, several state presets. Every renderer reads the same fields, so the hard states cost nothing extra to draw — which is the point, because a layout that only works in the state it was designed in is not a layout.

I reuse `screens.js`'s own helpers wherever the meaning is unchanged: `paceColor`, `paceWord`, `overageWord`, `drawPaceTick`, `drawMarkX`, `drawSmoke`, `drawIcon`, `drawRefreshIndicator`, `outlinedGlyph`. Importing them rather than re-typing them means a change to the pace thresholds moves all eleven screens at once, and it stops me quietly inventing a second vocabulary.

Nothing in `src/ui.cpp` or `docs/sim/screens.js` is touched. New files only: `docs/sim/alternatives.html` and `docs/sim/dashboard-alternatives.js`.

**The control column is reused where it fits.** Menu circle, signal glyph and refresh indicator at `V_CTRL_X` = 278. Three of the ten reject that column on their own terms (Tide, Face, Verdict) and have to find liveness and the menu another home. That is a real cost and gets recorded rather than hidden.

**Smoke is universal.** `drawSmoke` goes over every layout unchanged, because what it says is true of any screen.

## States to draw

Normal, plus three hard ones. All ten get all four, since the renderers are uniform.

- **Normal** — 5-hour binding, 34% used against 52% elapsed, comfortably behind pace.
- **Low** — 8% left, the sub-12% warning word, the 116px-in-a-102px-slot problem the shipped layout has. Tests whether a layout has a slot wide enough for a warning or has to shrink the type.
- **Blocked** — overage active and `rejected`, carrying `payment_failed` as a reason string. The longest string the screen ever has to hold, arriving at the worst moment.
- **Stale** — a failed fetch behind good numbers, the refresh indicator in its failing colour, plus the smoke overlay variant. Tests whether the layout has anywhere to say "these numbers are old" that is not the thing being doubted.

The three whose claims most need the hard states, if only three were drawn: **Verdict** (its whole claim is that marginalia can hold everything — the reason string is where that breaks), **Face** (carries meaning non-textually, so the rejection reason forces it back to words), and **Solo** (claims that dropping a window buys room, which only matters when something needs the room).

## Coverage table

Filled from what the pixels do, not from what I intended. **C** carried as it is on the shipped screen, **T** transformed into a different encoding, **D** dropped.

| Fact | Dial | Tide | Face | Verdict | Board | Agenda | Gap | Grid | Horizon | Solo |
|---|---|---|---|---|---|---|---|---|---|---|
| 5-hour amount | T | C | T | C | T | C | T | T | T | C |
| 7-day amount | T | C | T | C | T | C | T | T | T | T |
| Which binds | C | C | T | T | C | C | C | T | T | C |
| 5-hour reset | C | C | C | C | C | C | C | C | C | C |
| 7-day reset | C | **D** | C | **D** | C | C | C | C | C | C |
| Week dividers | C | C | **D** | C | **D** | C | **D** | **D** | C | C |
| Pace mark | C | C | T | C | **D** | C | T | C | T | C |
| Pace word, binding | C | C | C | C | C | C | C | C | C | C |
| Pace word, other | **D** | **D** | **D** | C | C | **D** | **D** | **D** | **D** | **D** |
| Headline ladder | C | C | C | C | T | C | C | C | C | C |
| Overage active + status | C | C | C | C | C | C | C | C | C | C |
| Allowance remaining | T | C | **D** | C | C | C | T | T | T | C |
| Allowance reset (monthly) | C | C | C | C | C | **C+** | C | **D** | C | C |
| Rejection reason | C | C | T | C | C | C | C | C | C | C |
| Data validity (`--`) | C | T | C | C | C | C | C | C | C | C |
| Staleness in words | T | C | T | T | C | C | T | C | T | T |
| Refresh liveness | C | C | C | C | C | C | C | C | C | C |
| Smoke overlay | C | C | C | C | C | C | C | C | C | C |
| Menu affordance | C | C | C | T | C | C | C | C | C | C |
| Battery warning | C | C | C | T | C | **C+** | C | C | C | C |
| Signal glyph (optional) | C | C | C | **D** | C | C | C | C | C | C |

**C+** marks the two cells where a layout does the job better than the shipped screen rather than merely as well: Agenda gives the monthly extra-usage reset and the dying battery their own rows on an axis that already sorts by time, where every other layout has to find somewhere to put them.

### The dropped cells, with their arguments

**The other window's pace word, dropped by eight of ten.** The strongest argument in the set, because the shipped screen already half-agrees: the non-binding window's caption is drawn but the whole design says that window is not what will stop you. Two pace words on one screen also makes the reader compare them, which is work the server already did. Verdict and Board keep both, and Board's are the only ones that cost nothing, because a table row has a spare cell in it either way.

**The 7-day reset, dropped by Tide and Verdict.** Both spend their whole surface on one object and have one text zone each. Tide's gutter has no room for a label beside a 12px column; Verdict's strips are 8px tall. This is a real loss — "resets Friday" is the planning-register fact the design log says is the strongest defence against hoarding — and it is the price of the single-object idea. If either were built, the fix is a tap: the reset moment is exactly the kind of detail that belongs one layer down.

**Week dividers, dropped by Face, Board, Gap and Grid.** Face has no geometry that can take a seven-part scale without an eyelid becoming a chart. Board and Gap have no graphic at all to divide. Grid is the interesting one: its 7-day field is seven columns wide, which looks like the dividers and is not — it fills bottom-up in rows of ten, so the columns encode nothing. That is exactly the failure the design log warns about when it says the divisions must be "a scale, not data", so calling the columns week dividers would be the lie. Making them true would mean filling column-major, which then makes each column a seventh of the *budget* rather than of the week, and the pace mark would have to move from the margin to underneath. Worth trying; not what is drawn.

**The pace mark, dropped by Board.** Board's whole claim is that the words carry it. This is the cell the layout exists to test, and looking at it, the words do carry it — but the mark is what made the words trustworthy, because a mark shows a relationship and a word asserts one. Board inherits the assertion without the evidence.

**The allowance remaining, dropped by Face.** A face has two eyes and a mouth, and all three are spoken for. The blush says extra usage is running; it does not say how much is left. Carrying it would mean a third organ, which is where the metaphor stops paying.

**The monthly allowance reset, dropped by Grid.** The two fields are the two windows and there is no third field. Every other layout has a text row for it.

**The signal glyph, dropped by Verdict.** Deliberate and free: the glyph is leaving this screen for the menu anyway, and Verdict is the one layout with no gutter to put it in. Worth saying anyway — **Tide and Face are where signal would most want to come back**, because both have a quiet top corner that nothing else uses.

**Staleness in words, dropped conditionally by six.** Never unconditionally: each of those layouts has one bottom row and a queue for it — the rejection reason first, then the battery, then staleness. The argument is that the countdown ring is already warn-coloured for as long as nothing has succeeded, so the standing condition survives losing its sentence. The argument against it is the one the design log already made: "staleness is stated in words, not signalled by a colour", because a small element changing hue is too quiet a channel. So this is the set's most contested drop, and the honest reading is that a screen holding a rejection reason and a dying battery at the same time is a screen that has run out of room, not a screen that solved anything.

### What the numbers say

Of 210 cells, 22 are dropped and they are not evenly spread. Board and Agenda drop two each; Face drops three; Tide and Verdict drop two each but lose the same load-bearing fact (the second reset); Grid drops two and fakes a third. Nothing drops a window's amount, a reset it can reach, the binding flag, the headline ladder, liveness, smoke or the menu — which is the floor holding.

---

## Amendments made while building

- **Grid's pace rule.** Planned as a horizontal rule through the field. Built as a rule plus a diamond in the margin, because a rule inside a lit field is invisible against the lit cells and reads as a gap in the data. The margin diamond is the same mark the rest of the device uses.
- **Tide's contrast.** Planned to put the headline in the dry part. Built to swap the headline's colour when the waterline crosses it, because at 90% remaining the dry part is 24 pixels tall and the headline has nowhere else to go. That swap is the layout's main weakness and it is drawn rather than hidden.
- **Solo's second window.** Planned to appear at within 15 points. Built with the threshold exposed, because the interesting question is what the screen looks like mid-transition, not at either end.
- **The dial is sized by its type, not by the screen.** Planned as a large circle with a text margin on the right. The margin measured 40px and the strings that had to go in it measured up to 121, so the circle moved and the margin became two full-width rows underneath. The hole is 104px across because `100% left` is 104px at the stat face. That is the whole design constraint, and it arrived from the sim rather than from taste.
- **Verdict keeps the refresh ring where the shipped one is.** Planned to reject the control column outright. `drawRefreshIndicator` hard-codes its x, and re-implementing it here would have forked the one piece of vocabulary this file most wanted to share. So only the menu moves, to the opposite bottom corner, and the signal glyph goes. The claim "it refuses the gutter" became "it refuses the gutter's top half", which is less interesting and true.
- **Battery, added mid-build.** Folded into all ten rather than restarting. Argued as not-smoke, and given a different home in each layout; see the coverage table and the page's own section.
- **Nothing here is a bar chart of two windows.** Checked at the end against the range test at the top: it held. The nearest miss is Verdict and Gap gauge, which both lead with the relationship — but the pile-up state separates them completely, because Verdict's one slot gets taken by the battery and Gap gauge's four rows get taken by extra usage.

## Verification

Two node scripts, no dependencies, run from the repo root:

- `node docs/sim/check-alternatives.js` renders all eleven screens against sixteen states and measures every string against the device's own glyph widths. 176 renders, 0 crashes, 4 overflowing strings — and all four are the shipped dashboard's known 102px-slot problem, which is the finding it was written to catch.
- `node docs/sim/render-alternatives.js <dir>` writes one PNG contact sheet per state so the layouts can be compared without a browser.
