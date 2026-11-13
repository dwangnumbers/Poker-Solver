#!/usr/bin/env bash
cd "$(dirname "$0")"
node reportsub.js 95 0.05 reportsub_tight95 > out/reportsub_tight95.log 2>&1
echo done > out/D1_DONE
