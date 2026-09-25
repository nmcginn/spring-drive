# Physics

The source of truth for every physical parameter. Every constant in `src/sim/params.ts` has a row here, and every row here names its constant. Adding or changing a parameter means updating this file in the same PR, with a one-line justification.

Only the published anchors from `PLAN.md` are here so far. M1 populates the rest.

## Labels

Every value carries exactly one of these:

- **Published**: stated by Seiko or another citable source. The source column links it.
- **Derived**: follows by arithmetic from published values and earlier rows. The derivation is written out below, so it can be checked with a calculator.
- **Assumption**: chosen by us, because no source exists. The justification says why this value, and the article presents it as modelled.

A value is never promoted from assumption to published without a source. When in doubt, it stays an assumption and the PR flags it.

## Row format

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|

Units are SI, with the prefix written into the name wherever it could be ambiguous (`torqueNm`, `omegaRadS`, `capacitanceF`). The value here and the value in `params.ts` must match exactly. From M1 on, a test checks that every exported constant has a row.

---

## Published anchors

Treat these as fixed. Every derived value must be consistent with them.

| Quantity | `params.ts` name | Value | Units | Label | Source or justification |
|---|---|---|---|---|---|
| Glide wheel target speed | named in M1 | 8 | rev/s | Published | Seiko's published figure; citation added in M1 |
| Quartz reference | named in M1 | 32,768 | Hz | Published | Standard watch crystal (2¹⁵ Hz) |
| Power reserve | named in M1 | 72 | h | Published | 9R65 specification; citation added in M1 |
| Rated accuracy | named in M1 | ±15 (≈ ±0.5 s/day) | s/month | Published | 9R65 specification; citation added in M1 |

IC power consumption is reported in Seiko material as extremely low, in the tens of nanowatts. It has no row until a source has been verified. If none can be found, it goes under Assumptions and the PR flags it.

## Derived parameters

Populated in M1, in the order `PLAN.md` suggests: barrel turns, gear ratio, mainspring torque curve, rotor inertia and friction, generator constant and coil resistance, capacitor and brownout threshold. Each row's derivation goes under **Derivations**.

## Assumptions

Populated in M1. Each row says why this value, not just what it is.

## Derivations

One subsection per derived row. Show the arithmetic, from the published anchors and earlier rows to the value in the table.

## Model choices

Numerical choices that are not physical constants but decide what the numbers mean: the integrator and its timestep, the regulator's update rate, and how averaged mode is formed. The reasoning behind each is recorded in `docs/DECISIONS.md`, and this section links to it.

## Energy budget

The check from `PLAN.md`: mainspring energy is approximately the integral of friction, brake dissipation, and IC consumption over 72 h. Written out in M1 and asserted by test 5.

## Change log

When a value changes after it first lands, note it here: date, PR, old and new value, and why. Amend rows in place, and keep the history here.
