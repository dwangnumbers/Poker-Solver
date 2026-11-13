#!/usr/bin/env bash
cd "$(dirname "$0")"
while [ ! -f out/B_DONE ]; do sleep 15; done
node ../tools/equity_tables.js 50000 0 999 _b > out/eq2b.log 2>&1
node pf_sens.js > out/pf_sens.log 2>&1
python3 ../tools/eq3_lowrank.py 16 > out/lowrank.log 2>&1
while [ ! -f out/A_DONE ]; do sleep 15; done
node roofline.js > out/roofline.log 2>&1
node leafcost.js > out/leafcost.log 2>&1
node scaling.js > out/scaling.log 2>&1
node parallel.js > out/parallel.log 2>&1
echo done > out/C_DONE
