#!/bin/bash

# Test script for API security features
API_URL="http://localhost:8080"

echo "🔒 Testing Holiday Park API Security Features"
echo "============================================="
echo ""

# 1. Test health check (should work without auth)
echo "1. Testing health check (no auth required):"
curl -s "$API_URL/health" | jq '.'
echo ""

# 2. Test detailed health check
echo "2. Testing detailed health check:"
curl -s "$API_URL/health/detailed?includeMetrics=true" | jq '.'
echo ""

# 3. Test rate limiting (make multiple requests)
echo "3. Testing rate limiting (making 5 rapid requests):"
for i in {1..5}; do
  echo "Request $i:"
  curl -s -o /dev/null -w "Status: %{http_code}, Time: %{time_total}s\n" "$API_URL/api/searches"
done
echo ""

# 4. Test unauthorized access to protected endpoint
echo "4. Testing unauthorized access to protected endpoint:"
curl -s -w "\nStatus: %{http_code}\n" "$API_URL/api/execute/test-search" | jq '.'
echo ""

# 5. Generate a test token
echo "5. Generating test JWT token:"
cd /Users/fkalinski/dev/fkalinski/wakacje/apps/api
TOKEN=$(npm run generate-token user test-user test@example.com admin 2>/dev/null | grep "^Bearer" | cut -d' ' -f2)

if [ -z "$TOKEN" ]; then
  echo "Generating token manually..."
  TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1aWQiOiJ0ZXN0LXVzZXIiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE2MzAwMDAwMDB9.test"
fi

echo "Token generated (first 50 chars): ${TOKEN:0:50}..."
echo ""

# 6. Test authorized access with token
echo "6. Testing authorized access with JWT token:"
curl -s -H "Authorization: Bearer $TOKEN" \
  -w "\nStatus: %{http_code}\n" \
  "$API_URL/api/execute/test-search" | jq '.'
echo ""

# 7. Test CORS headers
echo "7. Testing CORS headers:"
curl -s -I -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  "$API_URL/api/searches" | grep -E "Access-Control|access-control"
echo ""

# 8. Test security headers
echo "8. Testing security headers:"
curl -s -I "$API_URL/health" | grep -E "X-Frame-Options|X-Content-Type-Options|Strict-Transport-Security|X-XSS-Protection"
echo ""

# 9. Test scheduler webhook without token
echo "9. Testing scheduler webhook without token (should fail):"
curl -s -X POST \
  -w "\nStatus: %{http_code}\n" \
  "$API_URL/api/webhooks/scheduler" | jq '.'
echo ""

# 10. Test scheduler webhook with token
echo "10. Testing scheduler webhook with correct token:"
curl -s -X POST \
  -H "x-scheduler-token: jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=" \
  -w "\nStatus: %{http_code}\n" \
  "$API_URL/api/webhooks/scheduler" | jq '.'
echo ""

echo "✅ Security tests completed!"
echo ""
echo "Summary:"
echo "- Health checks should work without authentication"
echo "- Protected endpoints should require JWT or API key"
echo "- Rate limiting should kick in after multiple requests"
echo "- Security headers should be present"
echo "- CORS should be properly configured"
echo "- Scheduler webhook should only work with correct token"