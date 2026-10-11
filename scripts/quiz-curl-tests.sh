#!/usr/bin/env bash
# Endpoint smoke tests for /api/quiz. Usage: bash scripts/quiz-curl-tests.sh [base_url]
# Uses the name "TEST" for every lead so test rows are easy to find and delete in Notion.
BASE="${1:-http://localhost:8787}"
SID() { node -e 'console.log(crypto.randomUUID())'; }

ANSWERS='{"industry":"construction","size":"6_15","channels":["whatsapp","phone"],"acquisition":"referrals","sink":"scheduling","hours":"5_10","pain":"לקוחות לא עונים לי ואני מתאם אותו סיור שלוש פעמים"}'

run() { # name, path, body
  echo "=== $1"
  curl -s -o /tmp/quiz-curl-body -w "HTTP %{http_code} in %{time_total}s\n" -X POST "$BASE$2" \
    -H 'content-type: application/json' -H 'origin: http://localhost:8787' --data "$3"
  head -c 1500 /tmp/quiz-curl-body; echo; echo
}

S1=$(SID)
run "partial after Q3" /api/quiz "{\"stage\":\"partial\",\"session_id\":\"$S1\",\"answers\":{\"industry\":\"construction\",\"size\":\"6_15\",\"channels\":[\"whatsapp\"]},\"utm\":{\"source\":\"test\"},\"device\":\"mobile\",\"website\":\"\"}"
run "valid complete lead" /api/quiz "{\"stage\":\"complete\",\"session_id\":\"$S1\",\"answers\":$ANSWERS,\"contact\":{\"name\":\"TEST\",\"whatsapp\":\"050-123-4567\",\"email\":\"\",\"consent\":true},\"utm\":{\"source\":\"test\",\"medium\":\"curl\",\"campaign\":\"quiz-dev\"},\"device\":\"mobile\",\"website\":\"\"}"
run "missing phone" /api/quiz "{\"stage\":\"complete\",\"session_id\":\"$(SID)\",\"answers\":$ANSWERS,\"contact\":{\"name\":\"TEST\",\"whatsapp\":\"\"},\"utm\":{},\"device\":\"mobile\",\"website\":\"\"}"
run "invalid phone (landline)" /api/quiz "{\"stage\":\"complete\",\"session_id\":\"$(SID)\",\"answers\":$ANSWERS,\"contact\":{\"name\":\"TEST\",\"whatsapp\":\"03-1234567\"},\"utm\":{},\"device\":\"mobile\",\"website\":\"\"}"
run "honeypot filled" /api/quiz "{\"stage\":\"complete\",\"session_id\":\"$(SID)\",\"answers\":$ANSWERS,\"contact\":{\"name\":\"TEST\",\"whatsapp\":\"0501234567\"},\"utm\":{},\"device\":\"mobile\",\"website\":\"http://spam.example\"}"
run "invalid option" /api/quiz "{\"stage\":\"complete\",\"session_id\":\"$(SID)\",\"answers\":{\"industry\":\"crypto\"},\"utm\":{},\"device\":\"mobile\"}"
echo "=== foreign origin"; curl -s -w " HTTP %{http_code}\n" -X POST "$BASE/api/quiz" -H 'origin: https://evil.example' -H 'content-type: application/json' --data '{}'; echo
echo "=== GET not allowed"; curl -s -w " HTTP %{http_code}\n" "$BASE/api/quiz"; echo
run "booking click" /api/quiz/click "{\"session_id\":\"$S1\"}"
echo "=== static asset still served"; curl -s -o /dev/null -w "HTTP %{http_code} /he/\n" "$BASE/he/"
echo "=== unknown path still 404 from assets"; curl -s -o /dev/null -w "HTTP %{http_code} /nope\n" "$BASE/nope"
echo "=== rate limit (25 fast requests, expect 429s at the end)"
for i in $(seq 1 25); do curl -s -o /dev/null -w "%{http_code} " -X POST "$BASE/api/quiz/click" -H 'content-type: application/json' --data "{\"session_id\":\"$(SID)\"}"; done; echo
