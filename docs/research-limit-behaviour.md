# How people respond to a depleting meter

Research commissioned 2026-09-05 to inform the display design. Distilled to what
changes decisions; citations kept so claims can be checked.

**Read the confidence ratings.** Two areas here have strong evidence, three
transfer only by inference, one is contested, and one is empty. They are not
equally load-bearing and are not presented as though they were.

---

## Four findings that should change this design

### 1. Precision late in a window causes overspending. Coarseness fixes it.

The most directly transferable result in the whole brief. Pocheptsova Ghosh and
Huang, across three field studies and two lab experiments, gave people accurate
and precise information about their remaining budget. The informed group
**overspent by 26.7%**; the uninformed group did not exceed budget at all. The
excess concentrated at the *end* of the budget period.

Two things reversed it: reminding people that leftover budget rolls over, and
showing a **range** instead of a point estimate — "€20–€60" rather than "€40".

> Confidence: moderate. Working paper, needs replication, but the direction
> agrees with the deadline literature.

**Implication.** Precise when there is plenty; coarse as the window closes. This
is the opposite of the designer's instinct, which is to get more exact as things
get tight.

### 2. Time-to-reset deserves at least as much weight as amount-remaining.

Range anxiety and low-battery anxiety are driven by uncertainty about *the cost
of running out*, not by the level. Franke and Krems documented EV drivers holding
a 20–25% safety buffer they never use; Rauh, Franke and Krems showed experienced
drivers were significantly less anxious than novices at identical displayed
range — the display did not change, the understood cost of running out did.

In a rolling window, running out costs a wait of known length. Making that
legible converts "I am running out" into "I get more at 3:40".

It also solves a second problem. Koo and Fishbach's small-area hypothesis says
attention goes to whichever quantity is smaller — so a lone shrinking number
grabs attention hardest exactly when you least want it to. A countdown is a
companion quantity that is *improving*.

> Confidence: good. Multiple domains, field data, converging.

### 3. One state change, tied to a projection — not two tied to levels.

The alarm literature is the strongest evidence in the brief and it is
unambiguous. Breznitz's *Cry Wolf* (1984): a single false alarm halves the
response to the next one, and operators **probability-match their response rate
to the alarm's actual hit rate**, automatically. In clinical monitoring 72–99% of
alarms are false or irrelevant; Drew et al. measured 187 audible alarms per bed
per day at UCSF. Physician override of decision-support alerts runs around 90%.

So "should it change colour at 60% or 85%?" has no evidence-based answer, and is
the wrong question. The answerable one: **what fraction of the times this fires
will the user do something differently and be glad?** A threshold that fires on
most working days is invisible within a week, and it discredits whatever sits
behind it.

> Confidence: high for the principle. Zero for any specific threshold value in
> this domain.

**Implication.** One state change, rarely, tied to a projection crossing a line
rather than a level crossing one. A continuous gradient is safer than discrete
alerting because it makes no promise and therefore cannot cry wolf.

### 4. The premise is weaker than the risk.

The claim that making scarcity salient improves decisions is **contested and
largely failed replication**. O'Donnell et al. (2021, *PNAS*) audited 20
replications of studies citing the seminal scarcity work: four were significant,
80% had smaller effects than the originals, ~30% pointed the opposite way. The
original authors dispute the audit's study selection, so this is unsettled rather
than overturned — but it cannot be cited as established.

Meanwhile the cost is better evidenced. Lambrecht and Skiera find empirical
support for the **taxi meter effect**: watching a meter run reduces the pleasure
of the activity being metered. People pay real money to not see the meter.

And the realistic size of the benefit is small. Karlin, Zinger and Ford's
meta-analysis of 42 consumption-feedback studies gives an overall effect of
**r = .071** — feedback works, weakly, with enormous heterogeneity. Allcott and
Rogers, on six million households, measured 1.4–3.3% reductions. Encouragingly,
those decayed at only 10–20% a year once treatment stopped, so something durable
forms; the early pattern is "action and backsliding" that consolidates over time.

> Confidence: low for the scarcity claims. Moderate for the taxi meter effect.
> Good for the feedback magnitudes.

**Implication.** A device optimised for continuous peripheral awareness buys a
small, poorly evidenced benefit at a real, better-evidenced cost. One optimised
to be consulted before starting something large, and to look calm the rest of the
time, buys the same benefit without the cost. Calibrate ambition: 1–3% is a
*successful* result by this literature's standards.

---

## Two places the evidence contradicts intuition

**More accurate information about remaining budget makes people spend more, not
less.** See finding 1.

**Under-use dominates almost every metered domain studied.** EV range buffers,
gym attendance (DellaVigna and Malmendier: members forecast 9.5 monthly visits,
made 4.17), US flexible spending accounts (roughly half of holders forfeit money
annually, averaging ~$436), prepaid balances. Tang et al.'s survey of 2,000+
mobile users found 91.9% report low-battery anxiety, onset clustering at **20%**,
with over 20% abandoning video they actively wanted to watch at that level — a
visible meter causing people to forgo valuable use, well before exhaustion, at a
threshold unrelated to actual need.

**If forced to choose which failure to design against, choose hoarding.**

---

## The two windows want opposite treatments

This falls out of the above and is the design decision to make first.

**The 7-day window** has uncertain future demand and costly exhaustion, so it
will produce hoarding. It wants generous, confident framing — and arguably should
not be shown at all until it is genuinely relevant.

**The 5-hour window** has a near, certain endpoint and no rollover — precisely
the conditions that flip behaviour toward end-of-window burn. It wants to become
*less* precise as it closes.

---

## On framing and progress

Kivetz, Urminsky and Zheng established the goal gradient in humans; Nunes and
Drèze the endowed progress effect (34% vs 19% completion for identical effort).

But goal gradient describes acceleration toward a **reward**. This meter has no
reward at the end, it has a wall. Applying it directly is a category error —
*unless the design invents a completion goal*, at which point the gradient
predicts exactly the end-of-window acceleration finding 1 observed.

**Whether goal gradient applies here is something the design decides.** A bar
that fills toward "complete" invents the goal. A bar that empties does not.

Levin and Gaeth's framing work (75% lean vs 25% fat) says "62% used" and "38%
remaining" are not psychologically equivalent — though the effect attenuated once
participants had direct experience, so this matters most to a new user.

**Avoid anything that reads as a completion meter:** no filling bar, no "you've
used X of your allowance", no streaks or totals that make full consumption feel
like an achievement.

---

## On projections

The user's real question is "will I finish this before I run out", and a level
cannot answer it.

AAA found in-dash fuel economy displays average only 2.3% error but range from
−6.4% to +2.8% per vehicle, heavily dependent on conditions — and that 74% of
drivers use miles-to-empty to decide when to fill up. The industry response is
instructive: bias the estimate conservative, build in margin, and in GM's case
**stop displaying the number below about 35 miles** rather than show one they
cannot stand behind.

Harrison et al. showed a progress indicator's *behaviour* changes perceived
duration independently of actual duration: users tolerate irregularity best early,
respond best to slow-to-fast pacing, and react worst to pauses.

**Volatility is more damaging than error.** A projection that visibly jumps
destroys trust faster than one quietly wrong. So: coarse bands, heavy smoothing,
deliberate pessimistic bias, and withdraw the projection entirely when the recent
rate is too variable to support one. **Blank is an honest state.**

> Confidence: moderate. Fuel-gauge work is consumer-organisation research;
> progress-bar work is about perceived waiting, so transfer is inference.

---

## On being an ambient display

Weiser and Seely Brown's calm technology, Pousman and Stasko's five
characteristics, Mankoff et al.'s ambient heuristics — well-established design
guidance, but the empirical grounding is **thinner than its canonical status
suggests**. No strong controlled study was found on why some ambient displays get
kept and others unplugged. The best proxy is in-home energy displays, whose
literature consistently reports novelty decay and abandonment.

The reframe worth keeping: **being ignored is not the failure mode.** Being
ignored in the periphery is the intent. The failure mode is being *unplugged*,
and the two causes pointed at are a display that changes when nothing meaningful
happened, and one that is unpleasant to have in your eye line. A depleting meter
is structurally at risk on the second.

**The resting state should carry about one bit: fine, or not fine.** Everything
else on inspection.

---

## Developers and AI quotas: no research exists

Looked, found nothing credible. There is reporting on developer reaction to
Anthropic's rate limits, and there are essays — Kenneth Reitz's "Flow State,
Metered" argues that showing tokens and reset times beside creative work makes
people experience thought as a reservoir with a refill schedule. A good
hypothesis, explicitly not data, and he says so.

One adjacent result matters. METR's 2025 randomised trial found experienced
open-source developers were roughly **19% slower** with AI tools while believing
themselves faster.

**So: do not evaluate this device by whether it feels helpful.** That
introspection is exactly the kind shown to be unreliable. Every choice here is a
hypothesis. Log what actually happened — when large tasks started, what the meter
read, whether the wall was hit, whether work stopped early.

---

## Sources

Scarcity: Mani et al. 2013 *Science* · O'Donnell et al. 2021 *PNAS* · Shah et al.
rebuttal *PNAS* 2023 · Lambrecht & Skiera 2006 *JMR*

Failure modes: Franke & Krems 2013 · Rauh, Franke & Krems 2015 *Human Factors* ·
Tang et al. 2020 (arXiv 2004.07662) · DellaVigna & Malmendier 2006 *AER* ·
Pocheptsova Ghosh & Huang (Think Forward Initiative)

Framing: Kivetz, Urminsky & Zheng 2006 *JMR* · Nunes & Drèze 2006 *JCR* · Levin &
Gaeth 1988 *JCR* · Koo & Fishbach

Feedback: Karlin, Zinger & Ford 2015 *Psychological Bulletin* · Allcott & Rogers
2014 *AER* · Darby 2006 DEFRA

Alarms: Breznitz *Cry Wolf* 1984 · Sendelbach & Funk 2013 · Drew et al. 2014
*PLOS ONE* · Felisberto et al. 2024

Projection: Harrison et al. 2007 UIST, 2010 CHI · AAA 2021

Ambient: Weiser & Seely Brown 1996 · Pousman & Stasko 2006 AVI · Mankoff et al.
2003 CHI

AI quotas: Reitz, "Flow State, Metered" · METR 2025
