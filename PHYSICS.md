# Physics

The source of truth for every physical parameter. Every constant in `src/sim/params.ts` has a row here, and every row here names its constant. Adding or changing a parameter means updating this file in the same PR, with a one-line justification.

## Labels

Every value carries exactly one of these:

- **Published**: stated by Seiko or another citable source. The source column links it.
- **Derived**: follows by arithmetic from published values and earlier rows. The derivation is written out below, so it can be checked with a calculator.
- **Assumption**: chosen by us, because no source exists. The justification says why this value, and the article presents it as modelled.

A value is never promoted from assumption to published without a source. When in doubt, it stays an assumption and the PR flags it.

## Row format

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|

Units are SI, with the prefix written into the name wherever it could be ambiguous (`torqueNm`, `omegaRadS`, `capacitanceF`). The value here and the value in `params.ts` agree to every digit shown here; a derived value is rounded, and its derivation gives the exact expression. `tests/sim/params-coverage.test.ts` checks both ways: every exported constant has a row with one of the three labels and a matching value, and every row names a constant that exists.

---


## Published anchors

Treat these as fixed. Every derived value must be consistent with them.

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Glide wheel target speed | `ROTOR_TARGET_REV_S` | 8 | rev/s | Published | Grand Seiko, [Spring Drive](https://www.grand-seiko.com/us-en/collections/movement/springdrive): the glide wheel is held at eight rotations a second. See the note on sources below. |
| Quartz reference | `QUARTZ_HZ` | 32,768 | Hz | Published | The standard watch crystal, 2¹⁵ Hz. Grand Seiko's [9R01 instructions, "Spring Drive Mechanism"](https://www.grand-seiko.com/instructions/html/GS_9R01_en/GOUMSYuvheerjh) describe the 32,768 Hz oscillator. |
| Power reserve | `POWER_RESERVE_H` | 72 | h | Published | Grand Seiko, [Caliber 9R65](https://www.grand-seiko.com/us-en/collections/movement/springdrive/9r65). |
| Rated accuracy | `RATED_ACCURACY_S_PER_MONTH` | 15 | s/month (±) | Published | Grand Seiko, [Caliber 9R65](https://www.grand-seiko.com/us-en/collections/movement/springdrive/9r65): ±15 s/month. |

**A note on sources.** The build container cannot reach grand-seiko.com, so none of the Grand Seiko pages above could be opened while writing this. Each figure was checked against search-result excerpts quoting them (Grand Seiko, Time+Tide, Teddy Baldassarre, Caliber Corner), and all agree. The maintainer should open the links once before these rows are relied on.

## Derived parameters

In the order `PLAN.md` suggests. Each row's arithmetic is under **Derivations**, in the same order.

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Target speed in rad/s | `ROTOR_TARGET_OMEGA_RAD_S` | 50.2655 | rad/s | Derived | 2π × 8. See D0. |
| Power reserve in seconds | `POWER_RESERVE_S` | 259,200 | s | Derived | 72 × 3,600. See D0. |
| Rated accuracy per day | `RATED_ACCURACY_S_PER_DAY` | 0.5 | s/day (±) | Derived | 15 ÷ 30. See D0. |
| Divider stages, crystal to reference | `REFERENCE_DIVIDER_STAGES` | 12 | stages | Derived | log₂(32,768 ÷ 8). See D0. |
| Reference tick rate | `REFERENCE_HZ` | 8 | Hz | Derived | 32,768 ÷ 2¹². One tick per intended glide wheel turn. See D0. |
| Gear ratio, barrel to glide wheel | `GEAR_RATIO` | 296,228.6 | turns/turn | Derived | 8 rev/s × 259,200 s ÷ 7 turns. See D1. |
| Generator constant | `GENERATOR_KE_V_S_RAD` | 0.019894 | V·s/rad | Derived | 1.0 V ÷ 50.2655 rad/s. See D4. |

## Assumptions

Each row says why this value, not just what it is. The article presents every one of these as modelled.

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Barrel turns, let down to full wind | `BARREL_TURNS_FULL` | 7 | turns | Assumption | The middle of PLAN.md's 6 to 8. A wristwatch barrel typically gives 6 to 8 useful turns; the 9R's figure is not published. See D1. |
| Going train efficiency | `TRAIN_EFFICIENCY` | 0.6 | – | Assumption | A ratio of about 300,000 takes five or six meshes; at about 0.9 per mesh, 0.9⁵ ≈ 0.59. See D1. |
| Mainspring torque curve | `MAINSPRING_TORQUE_CURVE` | see table | N·m | Assumption | The usual shape: a steep rise over the last few percent of wind, a gently sloping middle, and a collapse over the last few percent. The mid-wind 12 mN·m is typical of an automatic wristwatch barrel. See D2 and the table below it. |
| Glide wheel inertia | `ROTOR_INERTIA_KG_M2` | 1.0 × 10⁻¹⁰ | kg·m² | Assumption | A magnet disc about 4 mm across and 0.5 mm thick, with the train's reflected inertia folded in. See D3. |
| Coulomb friction at the glide wheel | `FRICTION_COULOMB_NM` | 1.5 × 10⁻⁹ | N·m | Assumption | Speed-independent pivot and train friction. Chosen, with the viscous term, so friction takes about 40% of the mid-wind drive at 8 rev/s and the unbraked wheel runs about 4× fast at full wind. See D3. |
| Viscous friction at the glide wheel | `FRICTION_VISCOUS_NM_S_RAD` | 1.6 × 10⁻¹⁰ | N·m·s/rad | Assumption | Speed-proportional oil drag and eddy losses. Chosen with the Coulomb term, as above. See D3. |
| Breakaway friction at the glide wheel | `FRICTION_STATIC_NM` | 3.0 × 10⁻⁹ | N·m | Assumption | Twice the Coulomb friction: lubricated pivots take more torque to start than to keep turning. Makes a dying spring stall the wheel outright instead of letting it crawl to a halt over hours. See D3. |
| Stribeck speed | `FRICTION_STRIBECK_RAD_S` | 1.0 | rad/s | Assumption | The speed over which the breakaway excess fades (1/e), about a sixth of a turn a second, far below 8 rev/s, so it only matters as the wheel stops. See D3. |
| EMF at target speed | `GENERATOR_EMF_AT_TARGET_V` | 1.0 | V | Assumption | The rectified mean at 8 rev/s. Its sine peaks at 1.571 V, which charges the capacitor to 1.34 V through the rectifier, 0.74 V above the IC's brownout, so the supply is never what ends regulation: the spring is (D5, D7). First chosen so the mean less the drop gave about 0.8 V; M7b charged from the peak instead, and the value was kept. See D4 and D5. |
| Magnet pole pairs | `GENERATOR_POLE_PAIRS` | 1 | pairs | Assumption | One north and one south pole, the simplest magnet that works, as in a quartz watch's stepping motor. The 9R's magnet layout is not published, and none of this project's sources give it. Only the generator widget's waveform depends on it: one EMF cycle per turn, so 8 Hz at 8 rev/s. The dynamics average the brake and the charging over each cycle (D4, D5), and those averages do not depend on how many cycles a turn makes. See D9. |
| Coil resistance | `COIL_RESISTANCE_OHM` | 123,370 | Ω | Assumption | Sized so the fully shorted coil can brake about 9× the largest excess torque, which is headroom for shocks. First chosen as 100 kΩ with the brake taken from the mean EMF, then raised by π²/8 when the brake became the sine's mean-square heat, so the brake did not move (decision 35). A winding of this resistance is the right order for the 110,000-turn coil reported in Seiko Epson's patents. See D4 and **Plausibility check**. |
| Rectifier drop | `RECTIFIER_DROP_V` | 0.2 | V | Assumption | A low-drop rectifier, as a Schottky diode or an on-chip synchronous rectifier would give. See D4. |
| IC and oscillator power | `IC_POWER_W` | 25 × 10⁻⁹ | W | Assumption | 25 nW is the figure widely reported for the Spring Drive IC, for example by [aBlogtoWatch](https://www.ablogtowatch.com/history-seiko-spring-drive-movement/2/) and [The 1916 Company](https://www.the1916company.com/blog/some-quality-time-with-the-grand-seiko-spring-drive-ufa.html). Neither page could be opened from the build container to confirm the figure or trace it to Seiko, so this stays an assumption until a primary source is checked. See D5. |
| IC brownout voltage | `IC_BROWNOUT_V` | 0.6 | V | Assumption | A plausible minimum for a low-voltage CMOS watch IC. Sets where the IC stops at the end of the reserve: at 4.275 rev/s, well after regulation has ended for want of drive. See D5. |
| IC start voltage | `IC_START_V` | 1.0 | V | Assumption | 0.4 V above brownout, the lowest round tenth of a volt that stops the IC once at the end of the reserve. At brownout the glide wheel sheds the IC's load and speeds up to 5.557 rev/s, where the capacitor charges to the peak less the drop, 0.891 V; the IC must not restart there, or it stops and starts over and over. At 0.75 V (before M7b) detailed mode restarted it 158 times over ten minutes; at 0.9 V it stops once, but with only 9 mV to spare. The IC restarts from 6.11 rev/s. See D5. |
| Storage capacitance | `CAPACITANCE_F` | 0.1 × 10⁻⁶ | F | Assumption | Large enough to carry the IC for 2.9 s with no generation, which rides out a knock that stops the wheel dead. While it charges it loads the wheel like extra inertia, about the wheel's own, so a larger one would slow lock (at 1 µF, before M7b, lock took 15 to 20 s). See D5. |

### The comparison watch

The intro (`hero-glide`) sets a gliding Spring Drive seconds hand beside an ordinary mechanical one. That watch is not part of the model, and nothing in `src/sim` reads its row; it is here because the reader sees its numbers.

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Beat rate of the ticking watch | `MECHANICAL_BEAT_HZ` | 8 | beats/s | Assumption | 28,800 vibrations an hour, the commonest rate in modern mechanical movements: Seiko's own 9S65 and the ETA 2824-2 both run at it. It stands for "a typical mechanical watch", not a particular one, so it is labelled an assumption; the maintainer may prefer to name a calibre and cite it. Its seconds hand steps 6° ÷ 8 = **0.75°** a beat. That it matches the glide wheel's 8 rev/s is a coincidence the article can use or ignore. |

### Model choices

Numerical choices that decide what the numbers mean. They are assumptions in the sense above, and labelled as such. The reasoning is in `docs/DECISIONS.md` (decision 6, as amended in M1, and decisions 19 and 23).

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Detailed timestep | `DETAILED_STEP_S` | 0.000244140625 | s | Assumption | 2⁻¹² s, 4,096 steps a second, inside PLAN.md's 2 to 4 kHz. Exactly 8 crystal cycles a step, and 512 steps a reference tick, so ticks land on steps. The fastest dynamics, the capacitor charging through the coil at R × C = 12.3 ms (its fastest, far below the peak; near its operating point it takes about 0.1 s, D5), is 51 steps. Decision 19. |
| Averaged step | `AVERAGED_STEP_S` | 1 | s | Assumption | The longest step averaged mode takes. Every regime change inside a step is located exactly (D7), so the step only sets how finely the spring's unwinding is followed. At 8 rev/s a second unwinds 50.27 ÷ 296,228.6 = 1.7 × 10⁻⁴ rad of barrel, 3.9 × 10⁻⁶ of full wind. That changes the drive by 1.3 parts in 10⁵ on the curve's steep top and 2 parts in 10⁴ low on the curve, where regulation ends, and each step uses the mean drive over its own angle, so what is left is second order. Decision 23. |
| Regulator phase gain | `REGULATOR_KP_PER_RAD` | 0.03 | 1/rad | Assumption | Tuned, with the two below, for the fastest worst-case lock and shock recovery across full, mid, and low wind, by a grid search rerun in M7b when the charging path changed. The optimum is broad, so round numbers from its middle. See D6. |
| Regulator integral gain | `REGULATOR_KI_PER_RAD_S` | 0.03 | 1/(rad·s) | Assumption | As above. Removes the steady phase offset, so the loop holds zero phase error at any wind. See D6. |
| Regulator speed gain | `REGULATOR_KD_PER_RAD_S` | 0.005 | s/rad | Assumption | As above. Damps the loop, which PI alone leaves ringing at low wind. See D6. |
| Nominal shock | `SHOCK_DELTA_OMEGA_RAD_S` | 12.566 | rad/s | Assumption | A quarter of target speed, 2 rev/s: large enough to be obvious on a phase scope, well inside what the brake and the spring can correct. Not a measured wrist shock: the glide wheel's response to real shocks is not published. |
| Lock: speed tolerance | `LOCK_SPEED_TOLERANCE` | 0.001 | – | Assumption | Mean speed over each reference period within 0.1% of 8 rev/s. Tighter than any eye can see in a gliding hand. See D6. |
| Lock: phase tolerance | `LOCK_PHASE_TOLERANCE_RAD` | 0.062832 | rad | Assumption | A hundredth of a turn, 3.6°. At 8 rev/s that is 1.25 ms of the seconds hand's travel. See D6. |

### Mainspring torque curve

`MAINSPRING_TORQUE_CURVE`, fraction of full wind to barrel torque. Straight lines join the points, so stored energy is an exact sum of trapezoids.

| Fraction wound | Barrel torque (N·m) |
|---|---|
| 0 | 0 |
| 0.03 | 0.008 |
| 0.1 | 0.0105 |
| 0.5 | 0.012 |
| 0.9 | 0.0132 |
| 0.97 | 0.0145 |
| 1 | 0.016 |

## Derivations

One subsection per step of PLAN.md's order, from the anchors to the values in the tables. Each can be checked with a calculator. Consequences of the parameters that the tests assert are collected under **Model predictions**.

### D0. Unit conversions and the divider

- ω₀ = 2π × 8 rev/s = **50.2655 rad/s**.
- Reserve: 72 h × 3,600 s/h = **259,200 s**.
- Accuracy: ±15 s/month ÷ 30 days/month = **±0.5 s/day**. (30 days is the usual convention for a monthly rating. Seiko's own daily equivalent may be quoted differently; the monthly figure is the published one.)
- Divider: 32,768 Hz ÷ 8 Hz = 4,096 = 2¹², so **12** binary stages, and 32,768 ÷ 2¹² = **8 Hz** at the end: one reference tick per intended turn of the glide wheel.

### D1. Barrel turns and gear ratio

At 8 rev/s for 72 h the glide wheel turns 8 × 259,200 = 2,073,600 times. Seven barrel turns (assumption) must supply all of them:

G = 2,073,600 ÷ 7 = **296,228.6** glide wheel turns per barrel turn.

That treats all seven turns as usable. In fact regulation ends shortly before the barrel is empty, when the spring can no longer overcome friction at 8 rev/s. That lands the model's regulated reserve at 70.65 h, 1.9% short of 72 h (see D5 and **Model predictions**), which is inside test 4's ±10%.

The train passes torque down and speed up with efficiency η = 0.6 (assumption): at the glide wheel, τ_drive = τ_barrel × 0.6 ÷ 296,228.6 = τ_barrel ÷ 493,714.

### D2. Mainspring torque and stored energy

Stored energy at full wind is the area under the curve, per unit fraction, times the full-wind barrel angle 7 × 2π = 43.982 rad:

| Segment | Mean torque (N·m) × width | Area (N·m) |
|---|---|---|
| 0 to 0.03 | 0.004 × 0.03 | 0.000120 |
| 0.03 to 0.1 | 0.00925 × 0.07 | 0.0006475 |
| 0.1 to 0.5 | 0.01125 × 0.4 | 0.0045 |
| 0.5 to 0.9 | 0.0126 × 0.4 | 0.00504 |
| 0.9 to 0.97 | 0.01385 × 0.07 | 0.0009695 |
| 0.97 to 1 | 0.01525 × 0.03 | 0.0004575 |
| **Sum** | | **0.011735** |

E_full = 0.011735 N·m × 43.982 rad = **0.5161 J**, a mean barrel torque of 11.7 mN·m.

Drive torque at the glide wheel, τ_barrel ÷ 493,714:

| Wind | Barrel torque (N·m) | Drive at glide wheel (N·m) |
|---|---|---|
| Full (1) | 0.016 | 3.241 × 10⁻⁸ |
| Mid (0.5) | 0.012 | 2.431 × 10⁻⁸ |
| Low (0.03) | 0.008 | 1.620 × 10⁻⁸ |

### D3. Glide wheel inertia and friction

**Inertia.** A disc of radius 2 mm and thickness 0.5 mm has volume π × (2 × 10⁻³)² × 0.5 × 10⁻³ = 6.28 × 10⁻⁹ m³. At 7,500 kg/m³ (a magnet alloy or steel) that is 47 mg, and ½ m r² = ½ × 4.7 × 10⁻⁵ × (2 × 10⁻³)² = 9.4 × 10⁻¹¹ kg·m². Rounded, with the train's reflected inertia folded in: **1.0 × 10⁻¹⁰ kg·m²**. (Through a ratio this large, only the wheel next to the glide wheel reflects anything noticeable.)

**Friction at 8 rev/s.** τ_f = 1.5 × 10⁻⁹ + 1.6 × 10⁻¹⁰ × 50.2655 = 1.5 × 10⁻⁹ + 8.042 × 10⁻⁹ = **9.542 × 10⁻⁹ N·m**, 39% of the mid-wind drive. It dissipates 9.542 × 10⁻⁹ × 50.2655 = 0.480 µW.

**Unbraked at full wind** (PLAN.md step 3: the runaway must be dramatic). With no brake, friction alone balances the drive: ω = (3.241 × 10⁻⁸ − 1.5 × 10⁻⁹) ÷ 1.6 × 10⁻¹⁰ = 193.2 rad/s = 30.74 rev/s. The IC's small charging load (D5) takes that to **30.61 rev/s**, 3.8× the target.

**Low-speed friction.** Coulomb and viscous friction alone never quite stop the wheel. As the spring dies, its speed falls in proportion to the torque left over Coulomb friction, so it approaches zero exponentially, with a time constant of about an hour in this model. A Stribeck term fixes that: at rest the wheel must overcome breakaway friction τ_s = 3.0 × 10⁻⁹ N·m, and the excess over Coulomb fades with speed:

τ_f(ω) = τ_c + (τ_s − τ_c) × e^(−ω/ω_s) + b × ω, with ω_s = 1.0 rad/s.

At 8 rev/s the added term is 1.5 × 10⁻⁹ × e^(−50.3), which is nothing, so none of the running figures change. It matters only near a stop. The friction curve has a minimum where its slope is zero, at ω = ω_s × ln((τ_s − τ_c) ÷ (ω_s × b)) = ln(1.5 × 10⁻⁹ ÷ 1.6 × 10⁻¹⁰) = ln 9.375 = 2.24 rad/s (0.36 rev/s). There it is 1.5 × 10⁻⁹ + 1.6 × 10⁻¹⁰ × (1 + 2.24) = **2.02 × 10⁻⁹ N·m**. Once the drive falls below that, no running speed balances it, and the wheel stalls from about a third of a turn a second.

**Mechanical time constant.** J ÷ b = 1.0 × 10⁻¹⁰ ÷ 1.6 × 10⁻¹⁰ = 0.625 s: the unbraked wheel spins up in about two seconds.

### D4. Generator and brake

**Generator constant.** The EMF at target speed is 1.0 V (assumption), so k_e = 1.0 ÷ 50.2655 = **0.019894 V·s/rad**. `e = k_e·ω` is the rectified mean of the coil's AC output over each electrical cycle; the output itself is the sine of D9, peaking at (π/2)·k_e·ω. The cycle is far faster than the wheel's speed can change, so the dynamics see only averages over it (decision 20): the brake from the sine's mean square (below), and the charging from what a rectifier fed the sine delivers (D5, decision 37).

**Brake capacity.** A shorted coil turns its EMF into heat in its own resistance, e²/R at each instant, and every watt of it comes out of the wheel's motion, so the brake torque is the mean of e²/R over a cycle, divided by ω. The EMF is the sine of D9, and a sine's mean square is π²/8 = **1.2337** times the square of its rectified mean (its form factor, π/(2√2) = 1.1107, squared). So shorting the coil for a fraction d of the time brakes with

τ = d × (π²/8) × k_e² × ω ÷ R,

which is PLAN.md's k_e²ω/R_eff with R_eff = R ÷ (d × π²/8). Fully shorted at 8 rev/s: 1.2337 × (1.0 V)² ÷ (123,370 Ω × 50.2655 rad/s) = **1.989 × 10⁻⁷ N·m**. (Until decision 35 the brake was taken from the mean EMF alone, k_e²ω/R with R = 100 kΩ, which gives the same figure. The resistance was raised by exactly the π²/8 so that the brake, and everything it sets, stayed where it was; `COIL_RESISTANCE_OHM` is 100,000 × π²/8 = 123,370.06 rounded to the ohm, which moves the brake by 5 parts in 10⁷.) `tests/sim/generator.test.ts` integrates e(θ)²/R over a turn of the drawn waveform and checks it against the model's brake.

The largest excess the brake must absorb is at full wind: 3.241 × 10⁻⁸ − 9.542 × 10⁻⁹ − 5.81 × 10⁻¹⁰ (the charging load, D5) = 2.228 × 10⁻⁸ N·m. The brake has 8.9× that. Steady duty is excess ÷ capacity:

| Wind | Excess (N·m) | Steady duty |
|---|---|---|
| Full (1) | 2.228 × 10⁻⁸ | 0.112 |
| Mid (0.5) | 1.418 × 10⁻⁸ | 0.0713 |
| Low (0.03) | 6.08 × 10⁻⁹ | 0.0306 |

(Averaged mode solves the brake and the charging together, D7: the charging load shifts a little with duty, from 0.5807 nN·m at full wind to 0.5801 at low, and the duties it gives, 0.11201, 0.07129, and 0.03057, are these to the digits shown.)

**Why not a lower resistance.** A first attempt used 10 kΩ, which is what a short winding would give. The brake then had 90× headroom and ran at about 1% duty. Worse, with the capacitor charging through the rectifier, the coil couples the capacitor to the wheel so stiffly that the regulator fell into a ±0.9% speed oscillation. At 100 kΩ both go away (123 kΩ since decision 35, with the same brake). As a plausibility check, one of Seiko Epson's Spring Drive patents (WO2002004836A2) is reported to describe a 110,000-turn coil on a magnetic core. At about 3 mm a turn that is 330 m of wire, and 12 µm copper has 148 Ω/m, so about 50 kΩ; 123 kΩ is the same length of 7.6 µm wire, or a longer mean turn. The same order, which is all this check can say. The patent text could not be opened from the build container; that figure comes from search excerpts, and is flagged in the PR.

### D5. Power supply, IC, and capacitor

**How the rectifier charges.** The coil makes the sine of D9, e = E·sin θ, with E = (π/2)·k_e·ω, 1.5708 V at 8 rev/s. A full-wave rectifier with drop V_d into a capacitor at V conducts only while |e| exceeds the threshold u = V + V_d, and then passes (|e| − u) ÷ R. In each half cycle that is the window from α to π − α, where sin α = u ÷ E, around the peak. Over a cycle (`src/sim/rectifier.ts`):

- mean current ī = (2E·cos α − u·(π − 2α)) ÷ (πR);
- mean square ī² = (E²·(π/2 − α + sin α·cos α) − 4uE·cos α + u²·(π − 2α)) ÷ (πR²);
- power drawn from the EMF, the mean of |e|·i, p̄ = (E²·(π/2 − α + sin α·cos α) − 2uE·cos α) ÷ (πR), which is u·ī + R·ī²: the capacitor gets V·ī, the rectifier V_d·ī, the coil R·ī².

The wheel feels p̄ ÷ ω for the (1 − d) of the time the coil is not shorted. The current flows only near the peaks, where the coupling is strongest, so this is not k_e times the mean current, as it was before M7b. `tests/sim/generator.test.ts` integrates the rectifier's current, its heat, and its power over a turn of the drawn waveform and checks each against these to 10⁻⁶ (measured: 2 × 10⁻⁸).

So the capacitor charges toward the peak less the drop, not the mean less the drop. The mean-EMF model this replaced (M1 to M7) charged it to 0.7956 V at 8 rev/s; into 0.7 V it drove 0.1 V through R, where the sine drives a mean of 0.269 V, 2.69× as much.

**Operating point at 8 rev/s.** The IC draws P ÷ V, and the capacitor settles where (1 − d)·V·ī = P. At full wind, with d = 0.112, that is at **V = 1.3400 V**: u = 1.5400 V, sin α = 1.5400 ÷ 1.5708 = 0.9804, so α = 1.3724 rad (78.6°), and the rectifier conducts for (π − 2α) ÷ π = 12.6% of each half cycle, while the peak exceeds the threshold by 30.8 mV. Then ī·R = (2 × 1.570796 × 0.197078 − 1.539990 × 0.396754) ÷ π = (0.619140 − 0.610996) ÷ π = 0.002592 V, so ī = 21.01 nA, and (1 − 0.112) × 1.3400 × 21.01 nA = 25.0 nW. The IC current is 25 × 10⁻⁹ ÷ 1.3400 = 18.66 nA. Charging takes 29.19 nW from the wheel, of which the IC gets 25 nW, the rectifier 3.73 nW, and the coil 0.46 nW, and it loads the wheel with 29.19 nW ÷ 50.2655 rad/s = **5.81 × 10⁻¹⁰ N·m**. With the brake off the capacitor sits a little higher, at **1.3424 V** (the load 5.80 × 10⁻¹⁰ N·m), and at half wind 1.3409 V.

**The capacitor is held fixed over a cycle.** In the circuit the IC drains the capacitor between the peaks, so it ripples, and each peak charges it from a little lower. `tests/sim/rectifier.test.ts` integrates the circuit itself at 8 rev/s, 20,000 steps a cycle: the ripple is about **10 mV** peak to peak, and the mean sits 0.3 mV below the model's 1.3424 V. The model's figures are good to the millivolt, and its speeds and torques to far better. The coil's inductance, left out as in D10, would round off each pulse of current; with as much as 120 H (**Plausibility check**) the circuit settles 0.4 mV higher, which is as small.

**Brownout.** The capacitor falls to 0.6 V where the rectifier, with u = 0.8 V, can just deliver 25 nW ÷ 0.6 V = 41.67 nA: ī·R = 0.005140 V. Solving (2E·cos α − 0.8·(π − 2α)) ÷ π = 0.005140 with sin α = 0.8 ÷ E gives E = 0.839425 V (α = 72.4°), which is ω = 0.839425 ÷ (1.570796 × 0.0198944) = 26.862 rad/s = **4.275 rev/s**. That is where averaged mode browns out (D7), and detailed mode measures the same, 4.275 rev/s. (The mean-EMF model browned out at 6.441 rev/s.) At brownout the charging load is 41.67 nA's worth: 1.290 × 10⁻⁹ N·m.

**Restart.** Needs the peak less the drop to reach 1.0 V: E ≥ 1.2 V, so ω ≥ 1.2 ÷ 1.5708 × 8 = **6.11 rev/s**. At brownout the wheel sheds the IC's 1.290 nN·m and speeds up to where friction alone meets the drive, 5.558 rev/s, and the capacitor charges to 5.558 ÷ 8 × 1.5708 − 0.2 = **0.891 V**, short of the 1.0 V restart, so the IC stays off. See the start-voltage row for why the gap matters: at the 0.75 V the model used before M7b, that 0.891 V would restart the IC, it would load the wheel back down to brownout, and the cycle would repeat.

**Capacitor.** Two limits:

- Hold-up: with no generation at all, the IC's constant power takes ½C(V² − V_b²) ÷ P from the regulated voltage to brownout: 0.5 × 0.1 × 10⁻⁶ × (1.3400² − 0.6²) ÷ 25 × 10⁻⁹ = **2.87 s** at full wind, and 2.88 s from the 1.3409 V of half wind. Long enough to ride out a knock that stops the wheel dead (the model relocks after one; see test 6).
- Coupling: while charging, the capacitor tracks the peak less the drop, so it looks to the wheel like extra inertia C × ((π/2)·k_e)² = 0.1 × 10⁻⁶ × 0.03125² = 9.8 × 10⁻¹¹ kg·m², about the wheel's own, but only while speed rises (the rectifier blocks it on the way down). That asymmetry is what slows lock. At 1 µF (before M7b, with the mean-EMF model) lock took 15 to 20 s. Near the regulated point the rectifier conducts only at the peaks, and its current changes with the threshold at dī/du = −2(π/2 − α) ÷ (πR), an incremental resistance of 977 kΩ, so the capacitor settles with a time constant of about 0.1 s. Far below the peak it charges faster, toward R × C = 12.3 ms.

**No voltage limiter.** A real IC would clamp its supply. The model has no clamp, because in regulated running the capacitor never exceeds the peak less the drop, 1.37 V at 8 rev/s. Unbraked at full wind, though, it charges to 5.79 V. Nothing in the model depends on that, but a widget that shows supply voltage during a runaway would have to decide whether to model a clamp.

**End of regulation.** Regulation holds while the drive exceeds friction plus the charging load at 8 rev/s with the brake off: τ_barrel > (9.5425 × 10⁻⁹ + 5.799 × 10⁻¹⁰) × 493,714 = 4.998 × 10⁻³ N·m. On the curve's first segment that is at fraction 0.03 × 4.998 ÷ 8.0 = 0.01874, so the regulated reserve is (1 − 0.01874) × 72 h = **70.65 h**. After that the wheel slows, the IC browns out at fraction 0.01312, and the wheel runs on, unregulated and ever slower, until the drive falls below the friction minimum from D3. That is a barrel torque of 2.02 × 10⁻⁹ × 493,714 = 9.96 × 10⁻⁴ N·m, at fraction 0.03 × 0.996 ÷ 8.0 = **0.00374**, where the wheel stalls and breakaway friction holds it. A stopped wheel needs 3.0 × 10⁻⁹ × 493,714 = 1.48 × 10⁻³ N·m to start again, which is fraction 0.00555, so a stalled wheel stays stalled until the spring is wound a little.

### D6. The regulator

Seiko's control law is not public; this is a model of the principle (decision 6). At every reference tick, 8 times a second, the IC measures the phase error φ (how far the glide wheel is ahead of the reference, in radians) and sets the brake duty:

d = clamp(K_p × φ + K_i × Σφ·T + K_d × (φ − φ_prev) ÷ T, 0, 1), with T = 1/8 s.

The last term is the speed error averaged over the last reference period, which the IC can measure by counting. With the plant's numbers (duty to torque 1.989 × 10⁻⁷ N·m, inertia 1.0 × 10⁻¹⁰ kg·m²) PI alone rang at low wind and took 10 to 20 s to lock, so the speed term was added (decision 6, amended). The gains come from a grid search, scoring each set by the slowest of its lock from rest and its recovery from ±2 rev/s shocks at full, mid, and low wind (shocks at 12 s, runs of 20 s, lock as defined below).

- **M1.** Over K_p ∈ {0.015, 0.02, 0.025, 0.03}, K_d ∈ {0.002 … 0.006}, and K_i ÷ K_p ∈ {0.5, 0.75, 1, 1.5}, the best sets all locked within about 4 s, and (0.02, 0.02, 0.004) sat in the middle of them.
- **M7b.** Charging from the peak changed the plant: the capacitor now loads the wheel like about its own inertia while speed rises (D5), where it was 40%. With (0.02, 0.02, 0.004) lock from rest at full wind took 5.5 s, past the 4 s the gains were chosen for, so the search was rerun, first on the M1 grid and then, because its best set sat on the grid's edge at K_p = 0.03, on K_p ∈ {0.03, 0.035, 0.04, 0.05}, K_d ∈ {0.003 … 0.008}, K_i ÷ K_p ∈ {0.75, 1, 1.25, 1.5}. Scores, in seconds, slowest lock and slowest shock recovery, for the best sets:

| K_p | K_i | K_d | Lock (s) | Shock (s) |
|---|---|---|---|---|
| **0.03** | **0.03** | **0.005** | **4.0** | **2.5** |
| 0.03 | 0.03 | 0.006 | 4.0 | 3.25 |
| 0.035 | 0.035 | 0.005 | 4.0 | 3.0 |
| 0.03 | 0.03 | 0.004 | 4.125 | 2.625 |
| 0.035 | 0.035 | 0.004 | 4.25 | 2.75 |
| 0.02 | 0.02 | 0.004 (M1's) | 5.5 | 2.875 |

  (0.03, 0.03, 0.005) is best on both scores, and its neighbours are within a reference period of it, so the optimum is broad; K_i ÷ K_p stays 1. Its lock times from rest are 4.0 s, 3.875 s, and 4.0 s at full, mid, and low wind, and it relocks from every ±2 rev/s shock within 2.5 s (**Model predictions**).

Anti-windup is by conditional integration: the integral is frozen while the duty is pinned and the error would push it further.

When the IC starts, its counters start from zero, so the reference is aligned to wherever the glide wheel is at that moment (decision 19).

**Lock** is defined as: the IC running, mean speed over the last reference period within 0.1% of 8 rev/s, and phase error within a hundredth of a turn, held from then to the end of the run.

### D7. Averaged mode

Averaged mode (decision 23) takes steps of 1 s and treats everything detailed mode resolves inside a second as settled: the glide wheel's speed (mechanical time constant 0.625 s, D3), the capacitor (about 0.1 s near its operating point, D5), and lock (about 4 s, D6). So in each step the wheel turns at the speed where its torques balance, and the capacitor sits where its currents balance. Which balance holds is the regime:

| Regime | When | Speed | Capacitor |
|---|---|---|---|
| Regulated | IC on, brake enabled, on the reference, spring strong enough | 8 rev/s exactly | On the upper root of (1 − d)·V·ī = P (D5), with the duty that makes d·B + (1 − d)·p̄/ω₀ = excess, where B = (π²/8)·k_e²ω₀/R is the full brake. Solved together; see below. |
| Catching up | IC on, brake enabled, behind the reference | Drive = friction + charging load p̄/ω, above 8 rev/s | Upper root of V·ī = P |
| Holding back | IC on, brake enabled, ahead of the reference | Drive = friction + full brake, (π²/8)·k_e²ω/R | Drains at the IC's constant power, with nothing charging it |
| Free | Brake disabled, IC off, or spring too weak for 8 rev/s | Drive = friction (+ charging load if the IC is on) | As catching up with the IC on; with it off, charged to the peak less the drop, (π/2)·k_e·ω − V_d, and held |
| Stalled | Drive below the friction minimum (D3), or below breakaway for a wheel at rest | 0 | Drains, if the IC is on, as holding back |

**How the balances are solved.** Before M7b the regulated point was a quadratic in V. With the rectifier fed the sine, ī is not a polynomial in V, so the balances are solved numerically, but each over one variable, with everything else in closed form. The variable is the rectifier's conduction angle α (D5), where sin α = (V + V_d) ÷ E:

- *Regulated.* The speed, and so the peak E, is fixed. Each α gives V = E·sin α − V_d, then ī and p̄ in closed form, then the duty from the capacitor's balance, 1 − d = P ÷ (V·ī). What is left is the torque balance, which falls monotonically as α rises along the upper root (the duty falls with it), so it has one root. It is multiplied through by V·ī, which keeps it finite and smooth up to α = π/2, where ī vanishes.
- *Free and catching up.* The duty is zero, and the speed is unknown. Writing ī = 2u·h(α) ÷ (πR), with h(α) = cot α − (π/2 − α), the capacitor's balance V·ī = P becomes V·(V + V_d) = πRP ÷ (2h(α)), a quadratic in V. So each α gives V, then E = (V + V_d) ÷ sin α, then the speed, all in closed form, and the torque balance (drive = friction + p̄/ω) is solved for α. Along the balance the speed first falls with α, then rises; the upper root is where it rises, and it starts at whichever is higher of the α where V = V_b and the α where the speed is lowest. The IC's slowest sustainable speed, 4.275 rev/s (D5), is the speed there.
- Each is found by false position with the Illinois modification (`src/sim/solve.ts`), bracketed and closed to adjacent doubles, in 15 to 20 evaluations. It costs about 3 µs a regulated step and 5 µs a free one (decision 37).

Check of the regulated point at half wind, with the numbers from D2 to D5. The solver gives V = 1.34091 V: u = 1.54091 V, sin α = 1.54091 ÷ 1.570796 = 0.980974, α = 1.375415 rad (78.8°), ī·R = 0.0024767 V, so ī = 20.075 nA and 1 − d = 25 × 10⁻⁹ ÷ (1.34091 × 20.075 × 10⁻⁹) = 0.92871, **d = 0.0713**. The charging path then draws p̄ = 31.414 nW for 92.9% of the time, a load of 0.92871 × 31.414 × 10⁻⁹ ÷ 50.2655 = 5.804 × 10⁻¹⁰ N·m, and the brake 0.07129 × 1.9894 × 10⁻⁷ = 1.4183 × 10⁻⁸ N·m. Together, 1.4763 × 10⁻⁸ N·m: the drive less friction at half wind, 2.4306 × 10⁻⁸ − 9.5425 × 10⁻⁹, to every digit.

Phase error is tracked, not settled: it grows at (ω − ω₀) while the IC runs off the reference. The moment a catch-up or hold-back brings it back to zero, and the moment a draining capacitor reaches 0.6 V (after ½C(V² − V_b²) ÷ P seconds), are solved for exactly, and the step is split there. A power-on realigns the reference to the wheel, as in detailed mode (decision 19).

**Where it differs from detailed mode.** It has no spin-up or lock transient: a movement let go at full wind is regulated from t = 0. It trails nothing: unregulated, detailed mode's speed lags the balance speed by (J/b) × |dω/dt| as the spring weakens, which on the curve's steep bottom is 1.6 × 10⁻⁴ of the speed. It does not model shocks, which last milliseconds. And it has no capacitor lag at brownout, so it browns out at the quasi-steady 4.275 rev/s; detailed mode, whose wheel slows through brownout far more slowly than its capacitor settles, measures the same. Test 7 measures the first two against detailed mode.

**The run-down, in averaged mode.** From full wind, regulation holds until the drive falls to friction plus the charging load at 8 rev/s. At the end of regulation the duty is zero, so the capacitor is at its brake-off 1.34237 V, and the charging load is 29.148 nW ÷ 50.2655 rad/s = 5.7989 × 10⁻¹⁰ N·m (D5). The threshold is (9.5425 × 10⁻⁹ + 5.7989 × 10⁻¹⁰) × 493,714.3 = 4.9976 × 10⁻³ N·m of barrel torque, at fraction 0.03 × 4.9976 ÷ 8 = 0.018741 (D5's figure, two more digits). Regulated, the barrel unwinds at a constant rate, so that is (1 − 0.018741) × 259,200 s = **254,342 s = 70.651 h**. After it the wheel slows, and the IC browns out once the drive can no longer hold 4.275 rev/s against friction and the IC's load at 0.6 V: (1.5 × 10⁻⁹ + 1.6 × 10⁻¹⁰ × 26.862 + 1.290 × 10⁻⁹) × 493,714.3 = 3.4993 × 10⁻³ N·m, fraction 0.013122. Without the IC's load the wheel speeds up, to 5.558 rev/s, where the capacitor charges to 0.891 V, short of the 1.0 V restart (D5), and runs on until it stalls at fraction 0.00374 (D5). How long each of those stretches takes depends on the slowing speed, so those times come from integrating it: averaged mode puts the brownout at **256,264 s (71.184 h)** and the stall at **265,590 s (73.775 h)**. (The mean-EMF model browned out at 6.441 rev/s, at 70.847 h, three quarters of an hour after regulation ended; the peak-charging IC holds on for 32 minutes longer, down to 4.275 rev/s.)

**Rate.** The model's crystal is exact, so while the loop holds zero phase error the hands keep perfect time: averaged mode's rate while regulated is **0 s/day**, to float rounding. The published ±15 s/month (±0.5 s/day, D0) is met with room to spare, but for a reason the article must be careful with: what the real movement's rating allows for (the crystal's frequency tolerance and its drift with temperature, for instance) is simply not in the model, and stays out of it (decision 26).

### D8. The unbraked run-down

The runaway widget (M3) fast-forwards the glide wheel with the brake disabled, from full wind until it stops. Nothing new is assumed; this is what the parameters above imply, computed by averaged mode in its free regime (D7).

- **Speed.** It starts at the **30.61 rev/s** of D3. As the spring weakens the balance speed falls with it: 26.9 rev/s after an hour, as the curve's steep top is used up, then a slow slide through the flat middle, 22.5 rev/s at half wind. The IC stays on until the end, its capacitor charged far above what it needs, to the peak less the drop: from 5.79 V at full wind to 4.20 V at half wind, and 3.60 V three hours before the wheel slows through 8 rev/s (nothing clamps it; see D5).
- **Below 8 rev/s.** The wheel slows through 8 rev/s where the drive can no longer hold 8 rev/s against friction and the charging load. That is the same balance that ends regulation in D7, so it happens at the same wind fraction, **0.018741**, at **93,094 s (25.86 h)**.
- **Brownout and stall.** From there it follows D7's run-down: the IC browns out at 4.275 rev/s, at **95,014 s (26.39 h)**, and the wheel stalls at fraction 0.00374 (D5), at **104,340 s (28.98 h)**. That is **40%** of the published 72 h (40.25%).
- **What the hands show.** The hands are geared to the wheel, and the wheel's turns are fixed by the barrel turns spent: G × 7 turns × (1 − 0.00374) = 2,065,845 turns, whatever the speed. Read at 8 rev/s that is (1 − 0.00374) × 72 h = **71.73 h**. The unregulated watch shows nearly the full reserve's worth of time, crammed into 29 hours of real time.

### D9. The EMF waveform

The generator widget (M4) draws the waveform itself, and that needs two things the rectified mean e = k_e·ω does not: its shape, and how many cycles it makes per turn. Neither is published for the 9R, so both are assumptions. The shape matters to the dynamics too: the brake is the sine's mean-square heat (D4, decision 35), and the capacitor charges from its peaks (D5, decision 37). How many cycles a turn makes does not: both are averages over a cycle, whatever its length.

- **Shape: a sine.** The coil's flux linkage is taken as sinusoidal in the magnet's angle, λ = Λ·cos(p·θ), with θ = 0 where a north pole faces the coil. Then e = −dλ/dt = Λ·p·ω·sin(p·θ): zero as a pole passes the coil, and largest a quarter of a pole pitch later, where the flux changes fastest. A real magnet and coil give a waveform flattened or peaked somewhat away from a sine; the sine is the textbook first approximation, and the article presents it as modelled. A flatter waveform would charge the capacitor closer to its mean, and a peakier one higher, so the supply voltage in D5 is the sine's.
- **Cycles per turn: one.** `GENERATOR_POLE_PAIRS` = 1, so the EMF's frequency is p × ω ÷ 2π = the wheel's speed in rev/s: **8 Hz** at 8 rev/s.
- **Peak.** A sine's rectified mean is 2/π of its peak, so matching the mean to k_e·ω fixes the peak at (π/2) × k_e × ω. At 8 rev/s: (π/2) × 1.0 V = **1.5708 V**. At the widget's top speed, 16 rev/s, it is 3.1416 V, which the scope's ±3.5 V scale holds.
- **Check.** Averaged over a turn, |e| = (π/2) × k_e × ω × (2/π) = k_e × ω, the same 1.0 V at 8 rev/s that D4 is built on. `tests/sim/generator.test.ts` integrates the waveform numerically and confirms it at several speeds and pole counts.

What the widget shows is the open-circuit EMF, the voltage the moving magnet induces whether or not current flows. In the watch, the coil's terminal voltage differs from it by the current through the coil's 123 kΩ, and the capacitor only charges near the peaks, while the EMF exceeds its voltage plus the rectifier drop: at 8 rev/s, for the 12.6% of each half cycle when it is above 1.54 V (D5). The widget draws no current, so neither applies.

### D10. The coil as a brake, with the spring out of the way

The lenz-brake widget (M5) lets the glide wheel go from 8 rev/s with nothing driving it, and shows friction and the coil stopping it. Nothing new is assumed. The brake is D4's, duty-averaged: the coil is shorted for a fraction d of the time and open the rest, so the brake torque is d × (π²/8) × k_e²·ω/R. Nothing else is connected (no rectifier, capacitor, or IC), so an open coil carries no current at all and does nothing. `src/sim/spindown.ts` steps it with detailed mode's integrator and friction (D3).

- **Torques at 8 rev/s.** Fully shorted, (π²/8)·k_e²·ω₀/R = **198.9 nN·m** (D4). Friction is **9.542 nN·m** (D3), so the full brake is 198.9 ÷ 9.542 = **20.85** times friction. At d = 0.25, the widget's opening setting, the brake is 49.7 nN·m.
- **Coil current.** While shorted, the current follows the sine EMF, e(θ)/R. Its mean magnitude is the mean EMF over R, 1.0 V ÷ 123,370 Ω = **8.106 µA** at 8 rev/s, so a mean of d × 8.106 µA over the time shorted and open; its peak is π/2 of that, 12.7 µA. The widget shows the mean.
- **Spin-down, checked by hand.** Leaving out the Stribeck term (D3), the wheel obeys J·dω/dt = −τ_c − b′·ω, with b′ = b + d·(π²/8)·k_e²/R. So ω(t) = (ω₀ + τ_c/b′)·e^(−t·b′/J) − τ_c/b′, and it stops at t = (J/b′)·ln(1 + b′·ω₀/τ_c).
  - Open, b′ = 1.6 × 10⁻¹⁰, and J/b′ = 0.625 s. ln(1 + 1.6 × 10⁻¹⁰ × 50.2655 ÷ 1.5 × 10⁻⁹) = ln 6.362 = 1.850, so **1.156 s**.
  - Fully shorted, b′ = 1.6 × 10⁻¹⁰ + 1.2337 × 3.958 × 10⁻⁴ ÷ 123,370 = 4.118 × 10⁻⁹, and J/b′ = 24.3 ms. ln(1 + 4.118 × 10⁻⁹ × 50.2655 ÷ 1.5 × 10⁻⁹) = ln 139.0 = 4.934, so **0.120 s**.
  - The simulation matches both to within three steps (`tests/sim/spindown.test.ts`).
- **Spin-down, as the widget shows it.** With the Stribeck term, the breakaway friction that grows as the wheel slows ends each run a little sooner. Stop times from 8 rev/s: **1.118 s** open, **0.299 s** at d = 0.25, **0.185 s** at d = 0.5, and **0.110 s** fully shorted. The widget's time axis runs to 1.25 s, the open coil's time rounded up to a quarter second.
- **Where the energy goes.** The wheel's ½Jω₀² = ½ × 1.0 × 10⁻¹⁰ × 50.2655² = 1.263 × 10⁻⁷ J ends as heat: all in friction with the coil open, **82%** in the coil at d = 0.25, and **95%** fully shorted. The ledger is booked at each step's mean speed, which for semi-implicit Euler closes exactly (J·Δω = −τ·dt, so ΔKE = −τ·dt·ω̄), and it balances to float rounding.

**What this brake leaves out.** The coil's inductance, as in D4. With 110,000 turns on a core, a coil like this could plausibly have tens of henries, up to about 120 H (**Plausibility check**). Against 123 kΩ that is a time constant L/R of up to about 1 ms, against an electrical cycle of 125 ms at 8 rev/s. At 8 rev/s the coil's reactance, ω·L, is then at most 50.27 × 120 = 6.0 kΩ, 4.9% of its resistance, and a shorted coil's heat falls by 1 ÷ (1 + 0.049²), under 0.3%. The model leaves it out. (Until decision 35 this paragraph flagged a bigger gap: the brake was taken from the mean EMF, so it was π²/8 weaker than the heat the drawn sine would make. It no longer is.)

### D11. The divider chain, stage by stage

The quartz widget (M6) draws the output of every stage of the divider chain from D0. Nothing new is assumed and no parameter is added: the chain is `QUARTZ_HZ` halved `REFERENCE_DIVIDER_STAGES` times. What the widget adds is the level of each stage at each moment, which `src/sim/quartz.ts` gives as a pure function of the crystal's cycle count.

| Stage | Output (Hz) | Crystal cycles per level (half-period) | Half-period (s) |
|---|---|---|---|
| 0, the oscillator | 32,768 | 0.5 | 15.26 µs |
| 1 | 16,384 | 1 | 30.52 µs |
| 2 | 8,192 | 2 | 61.04 µs |
| 3 | 4,096 | 4 | 122.1 µs |
| 4 | 2,048 | 8 | 244.1 µs |
| 5 | 1,024 | 16 | 488.3 µs |
| 6 | 512 | 32 | 976.6 µs |
| 7 | 256 | 64 | 1.953 ms |
| 8 | 128 | 128 | 3.906 ms |
| 9 | 64 | 256 | 7.813 ms |
| 10 | 32 | 512 | 15.63 ms |
| 11 | 16 | 1,024 | 31.25 ms |
| 12, the reference | 8 | 2,048 | 62.5 ms |

Stage j's output is 32,768 ÷ 2ʲ Hz, and holds each level for 2ʲ⁻¹ crystal cycles (half a cycle for the oscillator itself), so its half-period is 2ʲ⁻¹ ÷ 32,768 s.

- **The oscillator's output.** The crystal swings sinusoidally, and the oscillator circuit squares that swing into a clock. The model takes the clock as low for the first half of each cycle and high for the second, so it falls as each cycle completes. Which half is high is a convention, and nothing else depends on it.
- **Each divider halves the one before.** Each stage is a flip-flop that changes state on every falling edge of the stage before it. So stage 1 changes once per crystal cycle, stage 2 once per two, and stage j once per 2ʲ⁻¹, which makes stage j's level bit j − 1 of the whole number of cycles counted: the chain is a 12-bit binary counter. `tests/sim/quartz.test.ts` checks this three ways: by counting each stage's edges over a second, by checking that each stage toggles on its input's falling edge and never otherwise, and by reading the levels as a binary number.
- **The reference tick.** The counter reads 0 to 4,095 and rolls over to 0 every 4,096 cycles, with every stage falling at once. Each rollover is one reference tick: 32,768 ÷ 4,096 = **8 per second**, and one every **0.125 s**. That is the same 4,096 cycles per tick the regulator already uses (D0, D6, decision 19), so the widget's ticks and the loop's are the same ticks.
- **Why it cannot drift.** The reference is not a second oscillator that could run at its own rate. It is the crystal's own cycles, counted, so it is exactly 1/4,096 of the crystal's frequency, and any error it has is the crystal's. The model's crystal is exact (decision 26), so in the model the reference is too. A real crystal is cut to a tolerance and drifts with temperature; no figure for either is published for the 9R, so the model has none, and the article says so.
- **Ripple or synchronous.** A chain of flip-flops each clocked by the one before is a ripple counter; a synchronous counter clocks every stage from the crystal. Their outputs differ only by the flip-flops' propagation delays, nanoseconds each, which no widget could draw. Seiko has not published the 9R's IC, so the widget shows the principle, and the prose says so.

**How the widget shows it.** 32,768 Hz cannot be drawn at 60 frames a second, so the widget slows the crystal by a power of two, 2⁰ to 2¹². Slowed 2ᵏ times, stage j cycles on screen at 2¹⁵⁻ʲ⁻ᵏ Hz. At k = 12 the oscillator shows at 2³ = **8 Hz**, the reference's own rate at real time, which is why the slider stops there: the chain is twelve stages long, and so is the slider. The diagram shows the last second of page time, so a trace is drawn only if its levels are at least 3 px wide; the rest are shaded. At real time on a 380 px phone, where the canvas is 324 px wide and the traces 210 px, a stage's level is 210 × 2ʲ⁻¹ ÷ 32,768 px: that leaves the 32, 16, and 8 Hz stages (3.3, 6.6, and 13.1 px), and shades the 64 Hz stage's 1.6 px and everything above it. The drawn crystal is a tuning fork, the usual shape of a 32,768 Hz watch crystal, and its swing is exaggerated: a real tine moves far less than its own width.

### D12. The loop, knocked and switched off

The loop widget (M7) runs the whole movement in detailed mode, regulated, from full wind, and lets the reader knock it and switch regulation off. Nothing new is assumed and no parameter is added: the movement is D1 to D6, the knock is `SHOCK_DELTA_OMEGA_RAD_S` (2 rev/s, as in test 6), and the controller is D6's. What follows is what those imply, as `tests/widgets/loop-logic.test.ts` and `tests/sim/disturbance.test.ts` assert.

- **Holding.** The widget opens on averaged mode's regulated point at full wind, carried into detailed mode locked from its first tick (decision 29): 8 rev/s, zero phase error, and the coil shorted **11.2%** of the time (D4), which is 0.1120 × 198.9 nN·m = **22.3 nN·m** of brake.
- **A knock.** The wheel's speed jumps by ±2 rev/s. The IC notices only at its next tick and acts only at ticks, so how far the wheel swings depends on where in the 0.125 s reference period the knock lands: furthest when it lands just after a tick, and least about two thirds of a period later. At full wind, over sixteen landing points across a period, a knock forward swings the phase error to between **+34.9° and +46.7°**, and a knock back to between **−51.8° and −65.9°**. At 8 rev/s a turn is 125 ms, so the hands are then 12 to 23 ms off, which the loop repays: a phase lock restores the phase, not just the speed (test 6). The swing back past zero is about a third of the first (−8.6° to −15.7° after a knock forward, +16.5° to +20.4° after one back). On a tick, the duty rises to 16.8% after a knock forward and falls to 3.3% after one back, and lock returns within **3.0 s** (test 6; at full wind it measured 2.5 s forward and 2.25 s back).
- **A knock back swings further than one forward, because of the capacitor.** Not because the controller favours a direction. With the charging path taken out (the rectifier's drop raised to 100 V, so it never conducts, and a 1 F capacitor so the IC runs regardless), a knock on a tick swings +67.7° forward and −68.4° back, and a quarter-size one ±17.0°: mirror images, so the brake's torque being proportional to speed as well as duty (D4) barely matters. With it, the swings are +46.7° and −65.9°, and +12.2° and −14.5° at a quarter size. At the regulated point the rectifier conducts only while the peak is within 30.8 mV of its top (D5), so a knock forward drives it hard, and the capacitor soaks up some of the knock as charge; a knock back stops it conducting at all, and the capacitor gives nothing back (the rectifier blocks it). So the charging path cushions a knock forward and not one back. (Before M7b, with the mean-EMF model, the quarter-size swings were +14.7° and −15.6°, nearly mirror images, and D12 could not say which effect it was.)
- **Regulation off.** The coil stays open, so the wheel runs away toward the unbraked **30.61 rev/s** of D3 (test 1). It gets there more slowly than the 0.625 s mechanical time constant suggests, because while it speeds up it is also charging the capacitor toward 5.8 V (D5), which is extra inertia on the way up, and a peak rectifier's current fades as the capacitor nears the peak: 28.5 rev/s after 3 s, 30.0 rev/s after 5 s, within 0.03 rev/s after 10 s, and at its top, 30.59 rev/s, after about 15 s, from which the spring's unwinding slowly takes it down. The IC still counts, so the phase error it would act on grows at the gap between the wheel and 8 rev/s: **22.3 turns a second** 5 s in, heading for 30.61 − 8 = 22.6, when the hands gain 30.61 ÷ 8 − 1 = 2.83 s every second. After **3 s** off, from 8 rev/s, they are **5.31 s** ahead.
- **Regulation back on.** The widget restarts the reference from wherever the wheel is, as a power-on does (decision 19), rather than letting the loop try to win back every turn the wheel gained (decision 36). The phase error is then zero, but the wheel is at 28.5 rev/s and races ahead of the new reference; the loop brakes it fully, down past 8 rev/s to 1.35 rev/s (near the 1.195 rev/s the full brake holds at full wind; **Model predictions**), and then lets it catch up the phase it has lost. After 3 s off, it relocks **4.25 s** after regulation comes back. The hands keep the 5.31 s the runaway gained, to within 0.1 ms: the loop repays its own phase error since the restart, and no more.
- **The capacitor after a runaway.** Unbraked, the wheel charges the capacitor toward the peak less the drop, 5.33 V after 3 s off (D5), and nothing clamps it. When regulation returns, the capacitor sits far above the 1.34 V it settles at while regulated, so the rectifier does not conduct and the wheel carries no charging load. The brake takes that load's share as well, so the steady duty is (3.241 × 10⁻⁸ − 9.542 × 10⁻⁹) ÷ 1.989 × 10⁻⁷ = **11.5%** rather than 11.2%, until the IC has drawn the capacitor back down. At 25 nW that takes ½C(V₁² − V₀²) ÷ P = ½ × 0.1 × 10⁻⁶ × (5.326² − 1.340²) ÷ 25 × 10⁻⁹ = **53 s**. The widget shows no supply voltage, so the clamp D5 says such a widget would have to decide on is not needed here; the 0.3 point difference in duty is the only trace of it.
- **After a knock that stops the wheel dead.** Not a widget control, but test 6 checks it at half wind. The capacitor carries the IC through the stop, and the wheel catches up the phase it lost, overshooting to 11.6 rev/s, which charges the capacitor to 1.94 V. At 8 rev/s the rectifier then cannot conduct until the IC has drained it back to 1.34 V, about 5 s later, and when it does, its load returns in a step that knocks the phase 4° off, past lock's 3.6°. So relock takes **6.125 s**, where it took 3.25 s before M7b.
- **What M7b moved.** When this section was first written (M7), it expected M7b to move only the two duties and the drain time, in their last digit or so. It moved more. Charging from the peak made the capacitor a stiffer, more one-sided load (D5), which changed how the loop responds to a knock and slowed the runaway's approach to full speed, and the regulator's gains were retuned for it (D6). Every figure in this section is M7b's.

**How the widget shows it.** The glide wheel is drawn as the reference sees it: turned from 12 o'clock, under the coil, by the phase error. In the model the reference starts wherever the wheel is when the IC starts (decision 19), so at every reference tick a locked wheel is back where it was then; the drawing puts that place at 12 o'clock, with the north pole under the coil and a mark in the crystal's colour. So a locked wheel stands still, a knocked one swings away and back, and a runaway one spins at 22.6 turns a second and is drawn as a blur (decision 28). A real stroboscope flashing at each tick would show the same wheel eight times a second; the widget draws the phase error continuously between ticks. The scope traces the last 8 s of speed, phase error, and duty, on scales zoomed on the full-wind operating point: 4 to 12 rev/s, ±90° (which holds every knock above), and 0 to 30% (which holds the 3% to 17% swing). Anything past an edge is pinned there and marked "off scale".

### D13. The whole reserve, and where the power goes

The tri-synchro widget (M8) runs the whole movement from full wind to a stop, sped up, in averaged mode (D7). Nothing new is assumed and no parameter is added: its run-down is D7's, and what it adds is where the power reaching the glide wheel goes, which `powerFlows` in `src/sim/averaged.ts` reads off averaged mode's operating point. What follows is what `tests/sim/power-flows.test.ts` and `tests/widgets/tri-synchro-logic.test.ts` assert.

**Where the power goes.** The train delivers the drive torque times the speed, and the quasi-steady wheel passes all of it on: to friction (D3), to the brake as heat in the shorted coil (D4), and to the charging path, which is the IC's 25 nW plus what the rectifier and the coil lose on the way (D5). At full wind, regulated:

| Flow | Arithmetic | Power | Share |
|---|---|---|---|
| Reaching the glide wheel | 3.241 × 10⁻⁸ N·m × 50.2655 rad/s (D2) | 1.629 µW | 100% |
| Friction | 9.542 × 10⁻⁹ N·m × 50.2655 rad/s (D3) | 0.4797 µW | 29.4% |
| Brake | 0.11201 × 1.9894 × 10⁻⁷ N·m × 50.2655 rad/s (D4) | 1.1201 µW | 68.8% |
| Electricity | 25 nW to the IC, 3.73 nW in the rectifier, 0.46 nW in the coil (D5) | 29.19 nW | 1.79% |

They add up to 1.6290 µW; `tests/sim/power-flows.test.ts` checks the balance to 10⁻¹¹ in every regime (measured: 3 × 10⁻¹³), and checks each flow against what the ledger books over a step. As the spring weakens only the brake's share changes: at half wind 1.222 µW arrives, and friction takes 39.3%, the brake 58.4%, and the electricity 2.4%; at fraction 0.03, 0.8145 µW, and 58.9%, 37.5%, and 3.6%. When regulation ends the brake has nothing left to take (friction 94.3%, electricity 5.7%), and after brownout friction takes it all. So the brake is where the spring's excess goes: two thirds of what reaches the wheel at full wind, and none at the end.

**The power reserve gauge.** It reads the barrel, as a mechanical indicator geared to it would: the barrel turns left, read at 8 rev/s. With G = 8 × 259,200 ÷ 7 (D1), that is exactly the fraction wound × 72 h, so full wind reads the published 72 h, and while regulated the gauge falls exactly an hour an hour. It reads the spring, not what the spring can still do: when regulation ends it still reads 0.018741 × 72 = **1.35 h**, and when the wheel stops, 0.00374 × 72 = **0.27 h** (D5). The 9R65's own indicator is not modelled; nothing here says how it is geared or where its zero is.

**The run-down as the widget shows it.** D7's figures, in hours and minutes: regulation ends at 70.651 h, **70 h 39 min**; the IC browns out at 71.184 h, **71 h 11 min**; the wheel stops at 73.775 h, **73 h 46 min**. The widget steps averaged mode at most a second at a time and books each event at the end of the step it fell in, so each lands within a second of D7's time.

- **Brake duty.** 11.2% at full wind (D4), falling fast over the curve's steep top (the last 3% of wind, 2.2 h of reserve) and then slowly: 7.13% at half wind, 3.06% at fraction 0.03, and nothing when regulation ends.
- **Supply.** 1.3400 V at full wind, 1.3409 V at half, and 1.3424 V at the end of regulation, with the brake off (D5). Then it falls with the slowing wheel, to 0.6 V at brownout, and jumps to **0.891 V** as the wheel sheds the IC's load and charges it to the peak less the drop (D5). It stays there: nothing in the model drains a capacitor with the IC off. A real capacitor and IC would leak it away slowly; no figure for either is published, so the model has none, and the widget's flat line after brownout is the model's.
- **The hands.** While regulated they keep perfect time, and the rate is **0 s/day**, because the model's crystal is exact (D7, decision 26); the widget says so beside the rate readout. After regulation ends they lose. The wheel's turns are fixed by the barrel turns spent, so when it stops they show **71.73 h**, D8's figure for the unbraked run-down, and they are 73.775 − 71.731 = **2.04 h** behind. A stopped watch loses a day a day: −86,400 s/day.

**How the widget shows it.** Time runs at a minute, ten minutes, an hour, or two hours a second (the whole reserve in 37 s at the fastest), and a Skip button jumps six hours. A chart over the published 72 h and six more traces speed, supply, and duty, sampled every five minutes of sim time and on both sides of every event; at that scale the last three hours are a few pixels wide, so the events are marked on it with dashed lines and named with their times beneath it.

## Model predictions

What the parameters above imply, as asserted by the physics tests. When a parameter changes, these change, and the tests say so.

| Prediction | Value | Test |
|---|---|---|
| Unbraked glide wheel speed at full wind | 30.61 rev/s (3.8× target) | Test 1, `tests/sim/runaway.test.ts` |
| Lock from rest, full wind | 4.0 s | Test 2, `tests/sim/lock.test.ts` |
| Lock from rest, mid wind (0.5) | 3.875 s | Test 2 |
| Lock from rest, low wind (0.03) | 4.0 s | Test 2 |
| Peak speed while locking from rest, full wind | 10.93 rev/s, sampled every step | Test 2 |
| Steady brake duty at full, mid, low wind | 0.112, 0.0713, 0.0306 | Test 2, `tests/sim/averaged.test.ts` |
| Steady capacitor voltage at 8 rev/s: full wind, half wind, brake off | 1.3400 V, 1.3409 V, 1.3424 V | Test 2, `tests/sim/averaged.test.ts` (D5) |
| Charging current against the drawn waveform | the mean of the rectifier's current, its heat, and its power over a turn of the drawn sine, to 10⁻⁶ | `tests/sim/generator.test.ts` (D5, decision 37) |
| Capacitor ripple at 8 rev/s, integrated with the circuit itself | about 10 mV peak to peak; mean within 1 mV of the model's (measured 0.3 mV) | `tests/sim/rectifier.test.ts` (D5) |
| Slowest speed that keeps the IC running, brake off | 4.275 rev/s | `tests/sim/averaged.test.ts`, test 4 (D5) |
| Relock after a ±2 rev/s shock, any wind | within 3.0 s (measured at most 2.5 s) | Test 6, `tests/sim/disturbance.test.ts` |
| Relock after a knock that stops the wheel, half wind | 6.125 s; bounded at 7 s | Test 6 (D12) |
| Regulated reserve from full wind | 70.651 h (254,342 s) | Test 4, `tests/sim/rundown.test.ts` |
| IC brownout at the end of a run-down, averaged mode | 71.184 h (256,264 s), at 4.275 rev/s | Test 4 |
| After brownout: the wheel, rid of the IC's load, and the capacitor | 5.557 rev/s, 0.891 V: short of the 1.0 V restart, so no chatter | Test 4 (D5) |
| Glide wheel stops, at the end of a run-down, averaged mode | 73.775 h (265,590 s) | Test 4 |
| Rate while regulated, 24 h from half wind | 0 s/day (exact crystal; see D7) | Test 3, `tests/sim/rate.test.ts` |
| Averaged against detailed mode, regulated | mean speed within 10⁻⁶, rate within 0.02 s/day | Test 7, `tests/sim/agreement.test.ts` |
| Averaged against detailed mode, unregulated | mean speed within 2 × 10⁻⁴ | Test 7 |
| Unbraked from full wind: falls below 8 rev/s | 93,094 s (25.86 h), at fraction 0.018741 | `tests/sim/runaway.test.ts` (D8) |
| Unbraked from full wind: IC brownout | 95,014 s (26.39 h) | `tests/sim/runaway.test.ts` (D8) |
| Unbraked from full wind: glide wheel stops | 104,340 s (28.98 h), 40% of 72 h | `tests/sim/runaway.test.ts`, `tests/widgets/runaway-logic.test.ts` (D8) |
| Unbraked from full wind: time the hands show when it stops | 71.73 h | `tests/sim/runaway.test.ts` (D8) |
| Detailed mode carried on from a settled averaged state | locked from the first reference tick, at any wind | `tests/sim/handover.test.ts` |
| Speed held back by the full brake at full wind | 1.195 rev/s | `tests/sim/averaged.test.ts` |
| Glide wheel stalls, at the end of a run-down | at fraction 0.00374, from about 0.36 rev/s | Test 5 (the run-down case), test 4 |
| EMF at 8 rev/s: peak and frequency | 1.5708 V, 8 Hz | `tests/sim/generator.test.ts` (D9) |
| EMF waveform's rectified mean, any speed | k_e·ω, within 10⁻⁶ | `tests/sim/generator.test.ts` (D9) |
| Brake at 8 rev/s, fully shorted, against friction | 198.9 nN·m, 20.85× friction's 9.542 nN·m | `tests/sim/spindown.test.ts` (D10) |
| Brake against the drawn waveform's heat | equal to the mean of e(θ)²/R over a turn, divided by ω, to 10⁻¹²; π²/8 = 1.2337× what the mean EMF alone gives | `tests/sim/generator.test.ts` (D4, decision 35) |
| Coil current at 8 rev/s, fully shorted | mean 8.106 µA | `tests/sim/spindown.test.ts` (D10) |
| Spin-down from 8 rev/s, spring out of the way: open, 25%, 50%, 100% shorted | 1.118 s, 0.299 s, 0.185 s, 0.110 s | `tests/sim/spindown.test.ts`, `tests/widgets/lenz-brake-logic.test.ts` (D10) |
| Share of the wheel's energy heating the coil in those spin-downs | 0%, 82%, 95% (open, 25%, 100%) | `tests/sim/spindown.test.ts` (D10) |
| Divider chain, stage j | 32,768 ÷ 2ʲ Hz; level = bit j − 1 of the cycle count | `tests/sim/quartz.test.ts` (D11) |
| Reference ticks | one per counter rollover, every 4,096 cycles: 8 a second, 28,800 an hour, 2,073,600 in 72 h | `tests/sim/quartz.test.ts` (D0, D11) |
| Quartz widget, slowed 4,096 times | the oscillator cycles on screen at 8 Hz; a reference tick every 512 s | `tests/widgets/quartz-logic.test.ts` (D11) |
| Loop widget at full wind, holding | 8 rev/s, 0.0°, duty 11.2%, brake 22.3 nN·m | `tests/widgets/loop-logic.test.ts` (D12) |
| Phase error after a ±2 rev/s knock at full wind, by where in the reference period it lands | +34.9° to +46.7° forward, −51.8° to −65.9° back; furthest when it lands on a tick | `tests/sim/disturbance.test.ts`, `tests/widgets/loop-logic.test.ts` (D12) |
| The same knock on a tick with the charging path taken out | +67.7° and −68.4°: the capacitor is what makes the two directions differ | `tests/sim/disturbance.test.ts` (D12) |
| Regulation off at full wind | phase error grows 22.3 turns/s 5 s in, heading for 22.6; after 3 s from 8 rev/s the hands are 5.31 s ahead | `tests/widgets/loop-logic.test.ts` (D12) |
| Regulation back on after 3 s off | relocks 4.25 s later; the hands keep the 5.31 s | `tests/widgets/loop-logic.test.ts` (D12) |
| Duty just after a runaway, until the capacitor drains | 11.5%, back to 11.2% after about 53 s | `tests/widgets/loop-logic.test.ts` (D12) |
| Where the power reaching the glide wheel goes, full wind | 1.629 µW: friction 29.4%, brake 68.8%, electricity 1.79% | `tests/sim/power-flows.test.ts`, `tests/widgets/tri-synchro-logic.test.ts` (D13) |
| Power reaching the wheel against friction, brake, and charging, every regime | equal, to 10⁻¹¹ (measured 3 × 10⁻¹³) | `tests/sim/power-flows.test.ts` (D13) |
| Tri-synchro widget's run-down from full wind | regulation ends 70 h 39 min, IC browns out 71 h 11 min, wheel stops 73 h 46 min, each within a second of D7 | `tests/widgets/tri-synchro-logic.test.ts` (D13) |
| Power reserve gauge: full wind, end of regulation, stop | 72.0 h, 1.35 h, 0.27 h | `tests/widgets/tri-synchro-logic.test.ts` (D13) |
| Hands when the wheel stops, regulated run-down | 71.73 h, 2.04 h behind true time | `tests/widgets/tri-synchro-logic.test.ts` (D13) |
| Energy balance, detailed mode | within 1 part in 10⁵ | Test 5, `tests/sim/energy.test.ts` |

Lock times are multiples of 0.125 s because lock is judged once per reference period.

## Energy budget

The check from `PLAN.md`: mainspring energy ≈ ∫ (friction + brake + IC) dt over the reserve. Over the 70.65 h of regulation, at 8 rev/s throughout (254,342 s):

| Where the energy goes | Arithmetic | Energy (J) | Share |
|---|---|---|---|
| Spring energy at full wind | D2 | 0.5161 | 100% |
| Left in the spring when regulation ends | energy below fraction 0.01874 | 0.0021 | 0.4% |
| Lost in the going train | 0.4 × (0.5161 − 0.0021) | 0.2056 | 39.8% |
| Glide wheel friction | 9.542 × 10⁻⁹ N·m × 50.2655 rad/s × 254,342 s | 0.1220 | 23.6% |
| IC | 25 nW × 254,342 s | 0.0064 | 1.2% |
| Rectifier and coil, while charging | (29.2 − 25) nW × 254,342 s (D5) | 0.0011 | 0.2% |
| Brake (coil heat while shorted) | what the wheel receives, 0.3084 J, less the three above | 0.1790 | 34.7% |

The budget closes by construction here. Averaged mode's ledger over a full run-down (test 4) reproduces it to within 0.0015 J, the difference being the 3 h of unregulated running after the 70.65 h this table covers, and closes on its own to 1 part in 10⁹. What test 5 checks is that the simulation's own ledger, where every term comes from its own formula at every step, closes too: over a minute of regulation, a runaway, random shocks, and a run-down to a stop, spring energy plus shock energy equals the sum of the losses plus the change in kinetic and capacitor energy to within 1 part in 10⁵.

## Plausibility check

Every assumption above was chosen to be *plausible*: consistent with physics, with comparable real parts, and with the four published anchors. None of them is *real*, in the sense of being the 9R's own figure, because Seiko does not publish them. This section records how each was checked, so the article can say which is which. The article's rule: a published figure is stated as the 9R's; everything else is "the model's", and where a check against a real part exists, the article may say the model's figure is of the same order as that part's, and no more.

Checked on 2026-09-27 (decision 35). The build container cannot open most watch sites, so the comparisons come from search-result excerpts, marked *excerpt*; the maintainer should open the sources before the article quotes them.

| Quantity | Model | Compared with | Verdict |
|---|---|---|---|
| Glide wheel speed, crystal, reserve, accuracy | 8 rev/s, 32,768 Hz, 72 h, ±15 s/month | Grand Seiko's own pages (see **Published anchors**) | **Real.** One excerpt quotes the 9R65 as "±1 second per day (±15 seconds per month)", Seiko's own rounding; the model derives ±0.5 s/day from the monthly figure (D0). |
| Barrel torque | 8 to 16 mN·m, 12 mN·m mid-wind | ETA 2824-2 mainspring, sold as a "1300 g·mm" spring, which is 1,300 × 9.807 × 10⁻⁶ = 12.7 mN·m (*excerpt*) | **Plausible, checked.** The same order as a common automatic's spring. The 9R65's single barrel and Spron 510 alloy are published; its torque is not. |
| Stored energy and mean power | 0.516 J over 72 h, 1.99 µW | "A typical watch barrel stores about 0.3 J and runs about 40 hours on it", 2.1 µW (*excerpt*) | **Plausible, checked.** The model's spring gives about the power of an ordinary mechanical watch, for longer. |
| Barrel turns, train efficiency | 7 turns, 0.6 | Watchmaking convention: 6 to 8 useful turns; 0.9 or so per mesh | **Plausible, unchecked** against the 9R. |
| Glide wheel inertia | 1.0 × 10⁻¹⁰ kg·m² | A 4 mm magnet disc, 0.5 mm thick (D3) | **Plausible, unchecked.** Its size is not published. It sets how fast the wheel responds, which only the lock and shock times show. |
| Friction at the glide wheel | 9.5 nN·m at 8 rev/s, 0.48 µW | Nothing published | **Narrative choice within a plausible range.** Its size follows from the energy budget (friction plus brake must absorb what the spring gives). The split between Coulomb and viscous parts was chosen so the unbraked wheel runs about 4× fast (D3). The real 9R, unbraked, could run away faster or slower, so the runaway widget's 30.6 rev/s is the model's. |
| EMF | 1.0 V rectified mean, 1.571 V peak, at 8 rev/s | The 110,000-turn coil on a magnetic core reported in a Seiko Epson patent (*excerpt*). A 1.571 V peak at 50.27 rad/s is a flux linkage of 0.0313 Wb-turns, or 0.28 µWb a turn: 0.07 T over a 2 mm × 2 mm core. A small rare-earth magnet gives a few tenths of a tesla across a small gap. | **Plausible, checked for order.** A real coil of that size could make more EMF than the model's, not less. |
| EMF waveform, poles | A sine, one pole pair | Nothing published about the 9R's magnet or its coils. The same patent excerpt also mentions a separate 40,000-turn stator coil, so the real movement likely has more than one coil. | **Assumption.** The model lumps the winding into one coil and draws one; the article says so (the generator's PROSE stub already does). |
| Coil resistance | 123 kΩ | That 110,000-turn coil: about 330 m of wire, 50 kΩ in 12 µm copper, 123 kΩ in 7.6 µm (D4) | **Plausible, checked for order.** |
| Coil inductance | Left out | Estimated as N²·µ₀·A ÷ g: 110,000² × 1.26 × 10⁻⁶ × 4 × 10⁻⁶ m² ÷ 0.5 mm ≈ 120 H for a core with a 0.5 mm magnetic gap, and less for a wider one | **Justified omission.** Even at 120 H the reactance at 8 Hz is 6 kΩ, 5% of the resistance, and the brake's heat falls by under 0.3% (D10). The charging path conducts in a narrower window, 7.9 ms around each peak at 8 rev/s against an L/R of up to 1 ms, but integrating the circuit with 120 H in it moves the capacitor by 0.4 mV (checked by hand for M7b, not in a test). |
| Brake | 199 nN·m full at 8 rev/s, 8.9× the largest excess; duty 3% to 11% | Nothing published | **Plausible design, unchecked.** Since decision 35 it is the heat the drawn sine would make in the coil (D4), so the model agrees with itself. |
| Rectifier drop | 0.2 V | A Schottky diode at nanoamps, or an on-chip synchronous rectifier | **Plausible, unchecked.** |
| IC power | 25 nW | Widely reported for the Spring Drive IC (*excerpts*), though some excerpts say instead that the glide wheel *generates* 25 nW | **Reported, not confirmed.** Stays labelled an assumption. The model's wheel delivers 29.2 nW to the electronics (25 nW to the IC, the rest lost in the rectifier and coil), and turns another 0.7 µW into brake heat (**Energy budget**). If "generates 25 nW" meant everything the generator converts, the real brake would dissipate far less than the model's; nothing published settles it. |
| IC brownout and start voltages | 0.6 V, 1.0 V | Seiko says the Spring Drive needed a new low-voltage IC, without a figure (*excerpt*) | **Plausible, unchecked.** |
| Storage capacitor | 0.1 µF | Seiko says the IC runs from a capacitor, without a figure (*excerpt*) | **Plausible, unchecked.** |
| Supply voltage and brownout speed | 1.34 V at 8 rev/s; brownout at 4.275 rev/s | Nothing published for the 9R. Against the model's own parts: the rectifier fed the drawn sine (D5), checked against the circuit integrated with its ripple (0.3 mV) and with up to 120 H of coil inductance (0.4 mV) | **Consistent with the model's own parts** since M7b (decision 37), which closed the gap the review found: the supply was the mean EMF's, 0.80 V, and brownout 6.44 rev/s. Both figures follow from assumptions (the EMF, the drop, the sine's shape, the IC's power), so the article may quote them only as the model's. |
| Capacitor after brownout | Holds its 0.891 V indefinitely: nothing drains it with the IC off (D13) | Nothing published about the 9R's capacitor or its leakage | **Known gap, shown.** A real capacitor and a stopped IC leak charge slowly, so the tri-synchro widget's flat supply trace after brownout is the model's. It changes nothing before brownout, and nothing a reader sees after it except that line. |
| Regulator gains, lock time | PID, lock in 3.9 to 4.0 s from rest | Seiko's control law is not published (decision 6) | **Model of the principle.** The lock times are the model's, and the article says the controller is a model. |
| Lock overshoot | 10.93 rev/s at full wind | – | **Corrected in this check.** PHYSICS.md said 10.9 rev/s, which was the peak sampled at the 8 Hz reference ticks; the true peak, between them, was 11.17 rev/s. Since M7b, with the new charging path and the retuned gains (D6), it is 10.93 rev/s, sampled every step. |
| Rate | 0 s/day while regulated | The 9R65's ±15 s/month | **Model property** (decision 26): the model's crystal is exact, so its rate says nothing about the real watch's, and the article says so. |

What the check did not find: any figure a reader sees that is off by an order of magnitude from its real-world comparison, or any published 9R figure the model contradicts. What it cannot rule out: that the real 9R divides its energy between friction, brake, and electronics very differently. The energy split in **Energy budget** is the model's, and the article presents it as such.

## Change log

When a value changes after it first lands, note it here: date, PR, old and new value, and why. Amend rows in place, and keep the history here.

- 2026-09-27, M7b (decision 37): the capacitor charges from the D9 sine through the rectifier, toward the peak less the drop, instead of from the mean EMF (D5). No parameter was added. Three values changed to keep the model's behaviour within its stated criteria:
  - `IC_START_V` 0.75 V → **1.0 V**. Charging from the peak, the wheel that sheds the IC's load at brownout charges the capacitor to 0.891 V, so at 0.75 V detailed mode restarted the IC 158 times over ten minutes. 1.0 V stops it once, with 0.11 V to spare. The restart speed moves from 7.6 to 6.11 rev/s.
  - `REGULATOR_KP_PER_RAD` 0.02 → **0.03**, `REGULATOR_KI_PER_RAD_S` 0.02 → **0.03**, `REGULATOR_KD_PER_RAD_S` 0.004 → **0.005**. The capacitor now loads the wheel like about its own inertia while speed rises, and the old gains locked from rest at full wind in 5.5 s, past D6's 4 s. D6's grid search was rerun and extended (D6).
  - What moved as a result: the steady capacitor voltage 0.7956 V → 1.3400 V at full wind; the brownout speed 6.441 → 4.275 rev/s; the regulated reserve 70.645 → 70.651 h; the run-down's brownout 70.847 → 71.184 h and stall 73.724 → 73.775 h; the charging load 6.25 → 5.81 × 10⁻¹⁰ N·m, so the steady duties 0.112, 0.071, 0.030 → 0.112, 0.0713, 0.0306; lock from rest 3.875, 4.125, 4.0 s → 4.0, 3.875, 4.0 s; the lock overshoot 11.17 → 10.93 rev/s; the unbraked run-down's brownout 26.06 → 26.39 h and stop 28.94 → 28.98 h; the hold-up 0.54 → 2.87 s; every D12 figure (the knock swings, the runaway's approach and the hands' gain, the relock after regulation returns, and the capacitor's drain time); and the held-back speed at full wind, which PHYSICS.md had as 1.194 rev/s, measured after a 10 s runaway, and is 1.195 rev/s at exactly full wind (unchanged by M7b; corrected in passing).
- 2026-09-27, decision 35 (the open question from M5): `COIL_RESISTANCE_OHM` 100,000 Ω → **123,370 Ω**. The brake became the mean-square heat of the D9 sine, π²/8 times the mean-EMF brake, and the resistance rose by the same factor, so the brake, its capacity, the steady duties, and every D10 figure stay where they were. The charging path's resistance rose with it: the steady capacitor voltage moved from 0.7965 V to 0.7956 V, lock from rest at full wind from 3.75 s to 3.875 s (one reference period), the brownout speed from 6.433 to 6.441 rev/s, the regulated run-down's brownout and stall each a few seconds earlier, and the shorted coil's mean current from 10 µA to 8.106 µA. The same PR corrected the lock overshoot from 10.9 rev/s to 11.17 rev/s: the old figure was the peak sampled only at the reference ticks, and the true peak falls between them.
- Before that, every value first landed in M1 or with its own milestone. M3 added `MECHANICAL_BEAT_HZ` and derivation D8, M4 added `GENERATOR_POLE_PAIRS` and derivation D9, M5 added derivation D10, M6 added derivation D11, M7 added derivation D12, and M8 added derivation D13, the last four with no new parameter; none changed an existing value.
