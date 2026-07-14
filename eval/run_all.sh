#!/bin/bash
# Phase 8 — run the full integration test suite. All must pass.
set -e
cd "$(dirname "$0")/.."
export USE_TF=0
echo "=== 1/3  Adversarial unit tests ==="; python3 eval/unit_tests.py
echo; echo "=== 2/3  HTTP API integration ==="; python3 eval/api_integration_test.py
echo; echo "=== 3/3  End-to-end benchmark (18 vehicles) ==="; python3 eval/e2e_test.py
echo; echo "ALL SUITES PASSED"
