#!/usr/bin/env bash
# Runs every experiment of the talk in sequence; results in out/*.json, logs in out/*.log
cd "$(dirname "$0")"
run() { echo "== $*"; "$@" > "out/$(basename "$2" .js)$3.log" 2>&1; }
node leafcost.js > out/leafcost.log 2>&1
node precision.js > out/precision.log 2>&1
node scaling.js > out/scaling.log 2>&1
node parallel.js > out/parallel.log 2>&1
node lock.js > out/lock.log 2>&1
node conv.js river 2000 > out/conv_river.log 2>&1
node conv.js turn 400 > out/conv_turn.log 2>&1
node conv.js flop 120 > out/conv_flop.log 2>&1
node reportsub.js 25,49,95 > out/reportsub.log 2>&1
echo all done > out/ALL_DONE
