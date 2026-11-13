#!/usr/bin/env bash
# Every measurement of the talk, in sequence (about three hours on two cores). Results in out/*.json, logs in out/*.log.
# Timing experiments run last so that nothing else competes for the processors.
set -e
cd "$(dirname "$0")"
node ../tools/equity_tables.js 50000 1000 > out/eq_tables.log 2>&1          # preflop tables (data/c2.u16, eq2.f32, eq3.u16)
node ../tools/equity_tables.js 50000 0 999 _b > out/eq2b.log 2>&1         # an independent pair table for the sensitivity test
python3 ../tools/eq3_lowrank.py 16 > out/lowrank.log 2>&1                  # low-rank factors and their errors
node ../test/river_vs_old.js > out/river_old.log 2>&1                      # validation against the earlier solver
node ../test/turn_check.js > out/turn_lp.log 2>&1                          # validation against an exact LP, one chance level
node ../test/turn_check.js 40 35 turn_lp_mid40 > out/turn_lp_mid40.log 2>&1     # mid-size exact LP
node ../test/flop_check.js > out/flop_lp.log 2>&1                          # validation against an exact LP, two chance levels
node ../test/exact_dcfr.js > out/exact_dcfr.log 2>&1                       # the zero-reach shortcut gives the plain DCFR iterates
node memest.js > out/memest.log 2>&1
node precision.js > out/precision.log 2>&1
node lock.js > out/lock.log 2>&1
node conv.js river 2000 1 > out/conv_river.log 2>&1
node conv.js turn 600 1 > out/conv_turn.log 2>&1
node conv.js flop 150 1 > out/conv_flop.log 2>&1
for s in river turn flop flopsize; do node convspots.js $s > out/convspots_$s.log 2>&1; done
node precbase.js > out/precbase.log 2>&1
node perturb.js > out/perturb.log 2>&1
node flatdir.js > out/flatdir.log 2>&1
node perturbT.js > out/perturbT.log 2>&1
node reportsub.js 25,49 0.05 reportsub_tight > out/reportsub_tight.log 2>&1
node reportsub.js 95 0.05 reportsub_tight95 > out/reportsub_tight95.log 2>&1
node pf_hu.js > out/pf_hu.log 2>&1; python3 pf_lp.py > out/pf_lp.log 2>&1
node pf_sens.js > out/pf_sens.log 2>&1
node pf_multi.js 1000 > out/pf_multi.log 2>&1
node roofline.js > out/roofline.log 2>&1
node leafcost.js > out/leafcost.log 2>&1
node scaling.js > out/scaling.log 2>&1
node costpairs.js > out/costpairs.log 2>&1
node parallel.js > out/parallel.log 2>&1

python3 parallel_browser.py > out/parallel_browser.log 2>&1   # needs docs/ served on port 8765
echo all done
