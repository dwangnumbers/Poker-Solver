#!/usr/bin/env bash
cd "$(dirname "$0")"
node precision.js > out/precision.log 2>&1
node conv.js river 2000 1 > out/conv_river.log 2>&1
node conv.js turn 600 1 > out/conv_turn.log 2>&1
node convspots.js river > out/convspots_river.log 2>&1
node convspots.js turn > out/convspots_turn.log 2>&1
node conv.js flop 150 1 > out/conv_flop.log 2>&1
node convspots.js flop > out/convspots_flop.log 2>&1
echo done > out/B_DONE
