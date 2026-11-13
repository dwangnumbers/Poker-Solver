#!/usr/bin/env bash
cd "$(dirname "$0")"
node reportsub.js 25,49,95 > out/reportsub.log 2>&1
echo done > out/A_DONE
