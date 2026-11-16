#!/usr/bin/env bash
# Random-board convergence study (sample.js): two parallel chains, about three hours on two cores.
cd "$(dirname "$0")"
( node sample.js flop S1 20 DCFR 400 0 10 > out/sample_flop_a.log 2>&1
  node sample.js river S1 50 DCFR,CFR+,CFR 3000 > out/sample_river_S1.log 2>&1
  node sample.js river S2 50 DCFR,CFR+,CFR 3000 > out/sample_river_S2.log 2>&1
  node sample.js turn S2 30 DCFR 1000 > out/sample_turn_S2.log 2>&1; echo A > out/S_A_DONE ) &
( node sample.js flop S1 20 DCFR 400 10 20 > out/sample_flop_b.log 2>&1
  node sample.js turn S1 40 DCFR,CFR+,CFR 600 > out/sample_turn_S1.log 2>&1; echo B > out/S_B_DONE ) &
wait
