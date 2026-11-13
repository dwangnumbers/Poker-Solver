#!/usr/bin/env bash
cd "$(dirname "$0")"
while [ ! -f out/ALL_DONE ]; do sleep 10; done
node lock.js > out/lock.log 2>&1
node parallel.js > out/parallel.log 2>&1
node scaling.js > out/scaling.log 2>&1
echo done > out/RUN2_DONE
