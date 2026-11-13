#!/usr/bin/env bash
cd "$(dirname "$0")"
node reportsub.js 25,49 0.05 reportsub_tight > out/reportsub_tight.log 2>&1
node pf_sens.js > out/pf_sens.log 2>&1
node precbase.js > out/precbase.log 2>&1
node pf_multi.js 1000 > out/pf_multi.log 2>&1
node convspots.js flopsize > out/convspots_flopsize.log 2>&1
node ../test/turn_check.js > out/turn_lp.log 2>&1
node ../test/flop_check.js > out/flop_lp.log 2>&1
node ../test/river_vs_old.js > out/river_old.log 2>&1
node memest.js > out/memest.log 2>&1
while [ ! -f out/D1_DONE ]; do sleep 15; done
python3 parallel_browser.py > out/parallel_browser.log 2>&1
node leafcost.js > out/leafcost.log 2>&1
echo done > out/E_DONE
