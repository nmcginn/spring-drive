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
| EMF at target speed | `GENERATOR_EMF_AT_TARGET_V` | 1.0 | V | Assumption | Enough to charge the capacitor to about 0.8 V through the rectifier, which is 0.2 V above the IC's brownout. See D4. |
| Coil resistance | `COIL_RESISTANCE_OHM` | 100,000 | Ω | Assumption | Sized so the fully shorted coil can brake about 9× the largest excess torque, which is headroom for shocks. A winding of this resistance is the right order for the coils reported in Seiko Epson's patents. See D4. |
| Rectifier drop | `RECTIFIER_DROP_V` | 0.2 | V | Assumption | A low-drop rectifier, as a Schottky diode or an on-chip synchronous rectifier would give. See D4. |
| IC and oscillator power | `IC_POWER_W` | 25 × 10⁻⁹ | W | Assumption | 25 nW is the figure widely reported for the Spring Drive IC, for example by [aBlogtoWatch](https://www.ablogtowatch.com/history-seiko-spring-drive-movement/2/) and [The 1916 Company](https://www.the1916company.com/blog/some-quality-time-with-the-grand-seiko-spring-drive-ufa.html). Neither page could be opened from the build container to confirm the figure or trace it to Seiko, so this stays an assumption until a primary source is checked. See D5. |
| IC brownout voltage | `IC_BROWNOUT_V` | 0.6 | V | Assumption | A plausible minimum for a low-voltage CMOS watch IC. Sets where regulation gives up at the end of the reserve. See D5. |
| IC start voltage | `IC_START_V` | 0.75 | V | Assumption | 0.15 V above brownout. With a narrower gap the IC stops, the glide wheel speeds up without its load, and the IC restarts, over and over. At 0.7 V the model chattered for about a minute at the end of the reserve; at 0.75 V it stops once. See D5. |
| Storage capacitance | `CAPACITANCE_F` | 0.1 × 10⁻⁶ | F | Assumption | Large enough to carry the IC through about half a second with no generation, small enough that its charging adds little inertia to the glide wheel. See D5. |

### The comparison watch

The intro (`hero-glide`) sets a gliding Spring Drive seconds hand beside an ordinary mechanical one. That watch is not part of the model, and nothing in `src/sim` reads its row; it is here because the reader sees its numbers.

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Beat rate of the ticking watch | `MECHANICAL_BEAT_HZ` | 8 | beats/s | Assumption | 28,800 vibrations an hour, the commonest rate in modern mechanical movements: Seiko's own 9S65 and the ETA 2824-2 both run at it. It stands for "a typical mechanical watch", not a particular one, so it is labelled an assumption; the maintainer may prefer to name a calibre and cite it. Its seconds hand steps 6° ÷ 8 = **0.75°** a beat. That it matches the glide wheel's 8 rev/s is a coincidence the article can use or ignore. |

### Model choices

Numerical choices that decide what the numbers mean. They are assumptions in the sense above, and labelled as such. The reasoning is in `docs/DECISIONS.md` (decision 6, as amended in M1, and decisions 19 and 23).

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Detailed timestep | `DETAILED_STEP_S` | 0.000244140625 | s | Assumption | 2⁻¹² s, 4,096 steps a second, inside PLAN.md's 2 to 4 kHz. Exactly 8 crystal cycles a step, and 512 steps a reference tick, so ticks land on steps. The fastest dynamics, the capacitor's RC of 10 ms, is 41 steps. Decision 19. |
| Averaged step | `AVERAGED_STEP_S` | 1 | s | Assumption | The longest step averaged mode takes. Every regime change inside a step is located exactly (D7), so the step only sets how finely the spring's unwinding is followed. At 8 rev/s a second unwinds 50.27 ÷ 296,228.6 = 1.7 × 10⁻⁴ rad of barrel, 3.9 × 10⁻⁶ of full wind. That changes the drive by 1.3 parts in 10⁵ on the curve's steep top and 2 parts in 10⁴ low on the curve, where regulation ends, and each step uses the mean drive over its own angle, so what is left is second order. Decision 23. |
| Regulator phase gain | `REGULATOR_KP_PER_RAD` | 0.02 | 1/rad | Assumption | Tuned, with the two below, for the fastest worst-case lock and shock recovery across full, mid, and low wind. The optimum is broad, so round numbers from its middle. See D6. |
| Regulator integral gain | `REGULATOR_KI_PER_RAD_S` | 0.02 | 1/(rad·s) | Assumption | As above. Removes the steady phase offset, so the loop holds zero phase error at any wind. See D6. |
| Regulator speed gain | `REGULATOR_KD_PER_RAD_S` | 0.004 | s/rad | Assumption | As above. Damps the loop, which PI alone leaves ringing at low wind. See D6. |
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

That treats all seven turns as usable. In fact regulation ends shortly before the barrel is empty, when the spring can no longer overcome friction at 8 rev/s. That lands the model's regulated reserve at 70.6 h, 1.9% short of 72 h (see D5 and **Model predictions**), which is inside test 4's ±10%.

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

**Generator constant.** The EMF at target speed is 1.0 V (assumption), so k_e = 1.0 ÷ 50.2655 = **0.019894 V·s/rad**. `e = k_e·ω` is the rectified mean of the coil's AC output over each electrical cycle. The cycle is far faster than the wheel's speed can change, so the dynamics see only the mean (decision 20).

**Brake capacity.** Shorting the coil for a fraction d of the time brakes with τ = d × k_e² × ω ÷ R, which is PLAN.md's k_e²ω/R_eff with R_eff = R/d. Fully shorted at 8 rev/s: k_e² × ω₀ ÷ R = (1.0 V)² ÷ (100,000 Ω × 50.2655 rad/s) = **1.989 × 10⁻⁷ N·m**.

The largest excess the brake must absorb is at full wind: 3.241 × 10⁻⁸ − 9.542 × 10⁻⁹ − 6.24 × 10⁻¹⁰ (IC load, D5) = 2.224 × 10⁻⁸ N·m. The brake has 8.9× that. Steady duty is excess ÷ capacity:

| Wind | Excess (N·m) | Steady duty |
|---|---|---|
| Full (1) | 2.224 × 10⁻⁸ | 0.112 |
| Mid (0.5) | 1.414 × 10⁻⁸ | 0.071 |
| Low (0.03) | 6.04 × 10⁻⁹ | 0.030 |

**Why not a lower resistance.** A first attempt used 10 kΩ, which is what a short winding would give. The brake then had 90× headroom and ran at about 1% duty. Worse, with the capacitor charging through the rectifier, the coil couples the capacitor to the wheel so stiffly that the regulator fell into a ±0.9% speed oscillation. At 100 kΩ both go away. As a plausibility check, one of Seiko Epson's Spring Drive patents (WO2002004836A2) is reported to describe a 110,000-turn coil. At about 3 mm a turn that is 330 m of wire, and 12 µm copper has 148 Ω/m, so about 50 kΩ: the same order. The patent text could not be opened from the build container; that figure comes from a search excerpt, and is flagged in the PR.

### D5. Power supply, IC, and capacitor

**Operating point at 8 rev/s.** The IC draws P ÷ V. The capacitor settles where the charging current, which flows only for the (1 − d) of the time the coil is not shorted, equals that draw: V = e − V_d − R × (P ÷ V) ÷ (1 − d) = 1.0 − 0.2 − 100,000 × (25 × 10⁻⁹ ÷ 0.7965) ÷ 0.888 = **0.7965 V**. The IC current is 25 × 10⁻⁹ ÷ 0.7965 = 31.4 nA, and it loads the wheel with k_e × 31.4 nA = **6.24 × 10⁻¹⁰ N·m**. Charging takes 1.0 V × 31.4 nA = 31.4 nW from the wheel, of which the IC gets 25 nW, the rectifier 6.3 nW, and the coil 0.1 nW.

**Brownout.** The capacitor can only reach e − V_d, so the IC stops once k_e × ω − 0.2 < 0.6, below ω = 0.8 ÷ 0.019894 = 40.2 rad/s = **6.4 rev/s** in the steady state. More exactly, with the IC's own draw through the coil, the capacitor settles at 0.6 V when e − V_d = 0.6 + R × P ÷ 0.6 = 0.6 + 0.0025 ÷ 0.6 = 0.60417 V, so at e = 0.80417 V, which is ω = 0.80417 × 50.2655 = 40.42 rad/s = **6.433 rev/s** (1 V of EMF is 8 rev/s, so this is just 0.80417 × 8). That is where averaged mode browns out (D7). (Detailed mode's capacitor lags the falling EMF slightly, and M1 measured its brownout nearer 6.7 rev/s.)

**Restart.** Needs k_e × ω − 0.2 ≥ 0.75, so ω ≥ 47.8 rad/s = **7.6 rev/s**: the IC only comes back when the spring can nearly hold target speed again. See the start-voltage row for why the gap matters.

**Capacitor.** Two limits:

- Hold-up: with no generation at all, from 0.7965 V down to 0.6 V at up to 25 nW ÷ 0.7 V ≈ 36 nA takes 0.1 × 10⁻⁶ × 0.1965 ÷ 36 × 10⁻⁹ = **0.55 s**. Long enough to ride out a knock that stops the wheel dead (the model relocks after one; see test 6).
- Coupling: while charging, the capacitor looks to the wheel like extra inertia C × k_e² = 0.1 × 10⁻⁶ × 3.958 × 10⁻⁴ = 3.96 × 10⁻¹¹ kg·m², 40% of the wheel's own, but only while speed rises (the rectifier blocks it on the way down). That asymmetry is what slows lock. At 1 µF it would be 4× the wheel's, and lock took 15 to 20 s. Its charging time constant is R × C = 10 ms.

**No voltage limiter.** A real IC would clamp its supply. The model has no clamp, because in regulated running the capacitor never exceeds e − V_d ≈ 0.8 V. Unbraked at full wind, though, it charges to e − V_d = 3.6 V. Nothing in M1 depends on that, but a widget that shows supply voltage during a runaway would have to decide whether to model a clamp.

**End of regulation.** Regulation holds while the drive exceeds friction plus IC load at 8 rev/s: τ_barrel > (9.542 × 10⁻⁹ + 6.24 × 10⁻¹⁰) × 493,714 = 5.020 × 10⁻³ N·m. On the curve's first segment that is at fraction 0.03 × 5.020 ÷ 8.0 = 0.01882, so the regulated reserve is (1 − 0.01882) × 72 h = **70.6 h**. After that the wheel slows, the IC browns out, and the wheel runs on, unregulated and ever slower, until the drive falls below the friction minimum from D3. That is a barrel torque of 2.02 × 10⁻⁹ × 493,714 = 9.96 × 10⁻⁴ N·m, at fraction 0.03 × 0.996 ÷ 8.0 = **0.00374**, where the wheel stalls and breakaway friction holds it. A stopped wheel needs 3.0 × 10⁻⁹ × 493,714 = 1.48 × 10⁻³ N·m to start again, which is fraction 0.00555, so a stalled wheel stays stalled until the spring is wound a little.

### D6. The regulator

Seiko's control law is not public; this is a model of the principle (decision 6). At every reference tick, 8 times a second, the IC measures the phase error φ (how far the glide wheel is ahead of the reference, in radians) and sets the brake duty:

d = clamp(K_p × φ + K_i × Σφ·T + K_d × (φ − φ_prev) ÷ T, 0, 1), with T = 1/8 s.

The last term is the speed error averaged over the last reference period, which the IC can measure by counting. With the plant's numbers (duty to torque 1.989 × 10⁻⁷ N·m, inertia 1.0 × 10⁻¹⁰ kg·m²) PI alone rang at low wind and took 10 to 20 s to lock, so the speed term was added (decision 6, amended). The gains came from a grid search over K_p ∈ {0.015, 0.02, 0.025, 0.03}, K_d ∈ {0.002 … 0.006}, and K_i ÷ K_p ∈ {0.5, 0.75, 1, 1.5}, scoring each set by its slowest lock from rest and its slowest recovery from ±2 rev/s shocks at full, mid, and low wind. The best sets all lock within about 4 s; (0.02, 0.02, 0.004) sits in the middle of them. Anti-windup is by conditional integration: the integral is frozen while the duty is pinned and the error would push it further.

When the IC starts, its counters start from zero, so the reference is aligned to wherever the glide wheel is at that moment (decision 19).

**Lock** is defined as: the IC running, mean speed over the last reference period within 0.1% of 8 rev/s, and phase error within a hundredth of a turn, held from then to the end of the run.

### D7. Averaged mode

Averaged mode (decision 23) takes steps of 1 s and treats everything detailed mode resolves inside a second as settled: the glide wheel's speed (mechanical time constant 0.625 s, D3), the capacitor (RC = 10 ms, D5), and lock (about 4 s, D6). So in each step the wheel turns at the speed where its torques balance, and the capacitor sits where its currents balance. Which balance holds is the regime:

| Regime | When | Speed | Capacitor |
|---|---|---|---|
| Regulated | IC on, brake enabled, on the reference, spring strong enough | 8 rev/s exactly | Upper root of c·V² − (c·a − g)·V + (R·P − g·a) = 0, where a = e − V_d, B = k_e²ω₀/R, c = 1 − excess/B, g = k_e·P/B. Duty then follows from the torque balance. |
| Catching up | IC on, brake enabled, behind the reference | Drive = friction + IC charging load, above 8 rev/s | Upper root of V² − a·V + R·P = 0 |
| Holding back | IC on, brake enabled, ahead of the reference | Drive = friction + full brake, k_e²ω/R | Drains at the IC's constant power, with nothing charging it |
| Free | Brake disabled, IC off, or spring too weak for 8 rev/s | Drive = friction (+ charging load if the IC is on) | As catching up with the IC on; with it off, charged to e − V_d and held |
| Stalled | Drive below the friction minimum (D3), or below breakaway for a wheel at rest | 0 | Drains, if the IC is on, as holding back |

Check of the regulated quadratic at half wind, with the numbers from D2 to D5: B = 1.989 × 10⁻⁷ N·m, excess = 2.431 × 10⁻⁸ − 9.542 × 10⁻⁹ = 1.477 × 10⁻⁸ N·m, so c = 0.92575, g = 0.0025, a = 0.8 V. Then c·a − g = 0.7381, R·P − g·a = 0.0005, and V = (0.7381 + √(0.7381² − 4 × 0.92575 × 0.0005)) ÷ (2 × 0.92575) = **0.7966 V**, with duty (1.477 × 10⁻⁸ − 0.019894 × 25 × 10⁻⁹ ÷ 0.7966) ÷ 1.989 × 10⁻⁷ = **0.071**, as in D4.

Phase error is tracked, not settled: it grows at (ω − ω₀) while the IC runs off the reference. The moment a catch-up or hold-back brings it back to zero, and the moment a draining capacitor reaches 0.6 V (after ½C(V² − V_b²) ÷ P seconds), are solved for exactly, and the step is split there. A power-on realigns the reference to the wheel, as in detailed mode (decision 19).

**Where it differs from detailed mode.** It has no spin-up or lock transient: a movement let go at full wind is regulated from t = 0. It trails nothing: unregulated, detailed mode's speed lags the balance speed by (J/b) × |dω/dt| as the spring weakens, which on the curve's steep bottom is 1.6 × 10⁻⁴ of the speed. It does not model shocks, which last milliseconds. And it has no capacitor lag at brownout, so it browns out at the quasi-steady 6.433 rev/s. Test 7 measures the first two against detailed mode.

**The run-down, in averaged mode.** From full wind, regulation holds until the drive falls to friction plus the IC's charging load at 8 rev/s. At the end of regulation the duty is zero, so the capacitor is at the upper root of V² − 0.8·V + 0.0025 = 0, 0.79686 V, and the charging load is 0.019894 × 25 × 10⁻⁹ ÷ 0.79686 = 6.2415 × 10⁻¹⁰ N·m. The threshold is (9.5425 × 10⁻⁹ + 6.2415 × 10⁻¹⁰) × 493,714.3 = 5.0194 × 10⁻³ N·m of barrel torque, at fraction 0.03 × 5.0194 ÷ 8 = 0.018823 (D5's figure, one more digit). Regulated, the barrel unwinds at a constant rate, so that is (1 − 0.018823) × 259,200 s = **254,321 s = 70.645 h**. After it the wheel slows, and the IC browns out once the drive can no longer hold 6.433 rev/s against friction and the IC's load at 0.6 V: (1.5 × 10⁻⁹ + 1.6 × 10⁻¹⁰ × 40.42 + 0.019894 × 25 × 10⁻⁹ ÷ 0.6) × 493,714.3 = 4.3430 × 10⁻³ N·m, fraction 0.016286. Without the IC's load the wheel speeds up a little, to 7.26 rev/s, too slow for the 7.6 rev/s restart (D5), and runs on until it stalls at fraction 0.00374 (D5). How long each of those stretches takes depends on the slowing speed, so those times come from integrating it: averaged mode puts the brownout at **255,053 s (70.848 h)** and the stall at **265,409 s (73.725 h)**.

**Rate.** The model's crystal is exact, so while the loop holds zero phase error the hands keep perfect time: averaged mode's rate while regulated is **0 s/day**, to float rounding. The published ±15 s/month (±0.5 s/day, D0) is met with room to spare, but for a reason the article must be careful with: what the real movement's rating allows for (the crystal's frequency tolerance and its drift with temperature, for instance) is simply not in the model, and stays out of it (decision 26).

### D8. The unbraked run-down

The runaway widget (M3) fast-forwards the glide wheel with the brake disabled, from full wind until it stops. Nothing new is assumed; this is what the parameters above imply, computed by averaged mode in its free regime (D7).

- **Speed.** It starts at the **30.61 rev/s** of D3. As the spring weakens the balance speed falls with it: 26.8 rev/s after an hour, as the curve's steep top is used up, then a slow slide through the flat middle, 22.4 rev/s at half wind. The IC stays on until the end, its capacitor charged far above what it needs: from 3.6 V at full wind down to about 2.2 V a few hours before the end (nothing clamps it; see D5).
- **Below 8 rev/s.** The wheel slows through 8 rev/s where the drive can no longer hold 8 rev/s against friction and the IC's charging load. That is the same balance that ends regulation in D7, so it happens at the same wind fraction, **0.018823**, at **93,100 s (25.86 h)**.
- **Brownout and stall.** From there it follows D7's run-down: the IC browns out at 6.433 rev/s, at **93,831 s (26.06 h)**, and the wheel stalls at fraction 0.00374 (D5), at **104,186 s (28.94 h)**. That is **40%** of the published 72 h.
- **What the hands show.** The hands are geared to the wheel, and the wheel's turns are fixed by the barrel turns spent: G × 7 turns × (1 − 0.00374) = 2,065,845 turns, whatever the speed. Read at 8 rev/s that is (1 − 0.00374) × 72 h = **71.73 h**. The unregulated watch shows nearly the full reserve's worth of time, crammed into 29 hours of real time.

## Model predictions

What the parameters above imply, as asserted by the physics tests. When a parameter changes, these change, and the tests say so.

| Prediction | Value | Test |
|---|---|---|
| Unbraked glide wheel speed at full wind | 30.61 rev/s (3.8× target) | Test 1, `tests/sim/runaway.test.ts` |
| Lock from rest, full wind | 3.75 s | Test 2, `tests/sim/lock.test.ts` |
| Lock from rest, mid wind (0.5) | 4.125 s | Test 2 |
| Lock from rest, low wind (0.03) | 4.0 s | Test 2 |
| Peak speed while locking from rest, full wind | 10.9 rev/s | – |
| Steady brake duty at full, mid, low wind | 0.112, 0.071, 0.030 | Test 2 |
| Steady capacitor voltage at 8 rev/s | 0.7965 V | Test 2 |
| Relock after a ±2 rev/s shock, any wind | within 3.0 s | Test 6, `tests/sim/disturbance.test.ts` |
| Regulated reserve from full wind | 70.645 h (254,321 s) | Test 4, `tests/sim/rundown.test.ts` |
| IC brownout at the end of a run-down, averaged mode | 70.848 h (255,053 s), at 6.433 rev/s | Test 4 |
| Glide wheel stops, at the end of a run-down, averaged mode | 73.725 h (265,409 s) | Test 4 |
| Rate while regulated, 24 h from half wind | 0 s/day (exact crystal; see D7) | Test 3, `tests/sim/rate.test.ts` |
| Averaged against detailed mode, regulated | mean speed within 10⁻⁶, rate within 0.02 s/day | Test 7, `tests/sim/agreement.test.ts` |
| Averaged against detailed mode, unregulated | mean speed within 2 × 10⁻⁴ | Test 7 |
| Unbraked from full wind: falls below 8 rev/s | 93,100 s (25.86 h), at fraction 0.018823 | `tests/sim/runaway.test.ts` (D8) |
| Unbraked from full wind: IC brownout | 93,831 s (26.06 h) | `tests/sim/runaway.test.ts` (D8) |
| Unbraked from full wind: glide wheel stops | 104,186 s (28.94 h), 40% of 72 h | `tests/sim/runaway.test.ts`, `tests/widgets/runaway-logic.test.ts` (D8) |
| Unbraked from full wind: time the hands show when it stops | 71.73 h | `tests/sim/runaway.test.ts` (D8) |
| Detailed mode carried on from a settled averaged state | locked from the first reference tick, at any wind | `tests/sim/handover.test.ts` |
| Speed held back by the full brake at full wind | 1.194 rev/s | `tests/sim/averaged.test.ts` |
| Glide wheel stalls, at the end of a run-down | at fraction 0.00374, from about 0.36 rev/s | Test 5 (the run-down case), test 4 |
| Energy balance, detailed mode | within 1 part in 10⁵ | Test 5, `tests/sim/energy.test.ts` |

Lock times are multiples of 0.125 s because lock is judged once per reference period.

## Energy budget

The check from `PLAN.md`: mainspring energy ≈ ∫ (friction + brake + IC) dt over the reserve. Over the 70.6 h of regulation, at 8 rev/s throughout (254,321 s):

| Where the energy goes | Arithmetic | Energy (J) | Share |
|---|---|---|---|
| Spring energy at full wind | D2 | 0.5161 | 100% |
| Left in the spring when regulation ends | energy below fraction 0.01882 | 0.0021 | 0.4% |
| Lost in the going train | 0.4 × (0.5161 − 0.0021) | 0.2056 | 39.8% |
| Glide wheel friction | 9.542 × 10⁻⁹ N·m × 50.2655 rad/s × 254,321 s | 0.1220 | 23.6% |
| IC | 25 nW × 254,321 s | 0.0064 | 1.2% |
| Rectifier and coil, while charging | (31.4 − 25) nW × 254,321 s | 0.0016 | 0.3% |
| Brake (coil heat while shorted) | what the wheel receives, 0.3084 J, less the three above | 0.1785 | 34.6% |

The budget closes by construction here. Averaged mode's ledger over a full run-down (test 4) reproduces it to within 0.0015 J, the difference being the 3 h of unregulated running after the 70.6 h this table covers, and closes on its own to 1 part in 10⁹. What test 5 checks is that the simulation's own ledger, where every term comes from its own formula at every step, closes too: over a minute of regulation, a runaway, random shocks, and a run-down to a stop, spring energy plus shock energy equals the sum of the losses plus the change in kinetic and capacitor energy to within 1 part in 10⁵.

## Change log

When a value changes after it first lands, note it here: date, PR, old and new value, and why. Amend rows in place, and keep the history here.

- (none yet: every value above first landed in M1, or with its own milestone. M3 added `MECHANICAL_BEAT_HZ` and derivation D8, and changed no existing value.)
