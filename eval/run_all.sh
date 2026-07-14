#!/bin/bash
# Full evaluation + integration suite (Phases 8–9). All must pass.
set -e
cd "$(dirname "$0")/.."
export USE_TF=0
echo "=== 1/5  Adversarial unit tests ==========================="; python3 eval/unit_tests.py
echo; echo "=== 2/5  HTTP API integration ============================"; python3 eval/api_integration_test.py
echo; echo "=== 3/5  End-to-end benchmark (18 vehicles) =============="; python3 eval/e2e_test.py
echo; echo "=== 4/5  Report faithfulness + relevancy ================="; python3 eval/faithfulness_eval.py
echo; echo "=== 5/5  Confidence-disclosure contract (Section 15) ====="; python3 eval/guardrails_test.py
echo; echo "ALL SUITES PASSED"
