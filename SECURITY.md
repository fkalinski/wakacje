# Security Implementation Documentation

## Overview
This document describes the comprehensive security measures implemented in the Holiday Park Monitor API to protect against common vulnerabilities and ensure data integrity.

## Security Features

### 1. Authentication & Authorization

#### JWT Authentication
- **Implementation**: JSON Web Tokens for stateless authentication
- **Token Lifetime**: 7 days for user tokens, 365 days for API keys
- **Algorithm**: HS256 with configurable secret
- **Headers**: `Authorization: Bearer <token>`

#### API Key Authentication
- **Implementation**: Long-lived tokens for service-to-service communication
- **Header**: `x-api-key: <api-key>`
- **Higher rate limits compared to regular users

#### Cloud Scheduler Authentication
- **Implementation**: Shared secret token
- **Header**: `x-scheduler-token: <token>`
- **Purpose**: Secure webhook endpoints for scheduled tasks

### 2. Rate Limiting

#### IP-Based Rate Limiting
Multiple rate limiting tiers based on endpoint sensitivity:

| Limiter | Window | Max Requests | Use Case |
|---------|--------|--------------|----------|
| `apiLimiter` | 15 min | 100 | General API endpoints |
| `strictLimiter` | 15 min | 20 | Sensitive endpoints |
| `authLimiter` | 15 min | 5 | Authentication attempts |
| `searchLimiter` | 1 hour | 30 | Search executions |
| `apiKeyLimiter` | 15 min | 1000 | API key requests |

#### Adaptive Rate Limiting
- Authenticated users get 2x higher limits
- API keys get 10x higher limits
- Rate limit info returned in headers:
  - `RateLimit-Limit`
  - `RateLimit-Remaining`
  - `RateLimit-Reset`

### 3. Security Headers (Helmet)

Comprehensive security headers to prevent common attacks:

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 1; mode=block
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Content-Security-Policy: default-src 'self'
Referrer-Policy: strict-origin-when-cross-origin
```

### 4. Input Validation & Sanitization

#### Automatic Sanitization
- Removes script tags and dangerous HTML
- Strips JavaScript event handlers
- Trims whitespace
- Applied to: body, query params, route params

#### Validation Rules
Using `express-validator` for structured validation:
- Email validation with normalization
- Password strength requirements (8+ chars, uppercase, lowercase, number)
- UUID validation
- Date format validation (ISO 8601)
- Array and string length limits

### 5. CORS Configuration

Configurable Cross-Origin Resource Sharing:
- Allowed origins from environment variable
- Credentials support
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Custom headers support
- Exposed headers for rate limiting

### 6. Firestore Security Rules

Granular access control at the database level:

```javascript
// User-owned data
match /searches/{searchId} {
  allow read: if isOwner(resource.data.userId) || hasRole('admin');
  allow write: if isOwner(resource.data.userId) || hasRole('admin');
}

// Read-only collections
match /availabilities/{id} {
  allow read: if isAuthenticated();
  allow write: if hasRole('admin');
}
```

### 7. Request Tracking & Monitoring

#### Correlation IDs
- Unique ID for each request
- Passed through all log entries
- Returned in response headers

#### Request Logging
- Method, path, status code, duration
- User identification
- IP address tracking
- Slow request detection (>3s)

### 8. Health Checks & Monitoring

Multiple health check endpoints:
- `/health` - Simple health check
- `/health/detailed` - Dependency status
- `/health/live` - Kubernetes liveness probe
- `/health/ready` - Kubernetes readiness probe
- `/health/metrics` - System metrics

## API Endpoints Security Matrix

| Endpoint | Authentication | Rate Limit | Special Requirements |
|----------|---------------|------------|---------------------|
| `/health/*` | None | 60/min | Public access |
| `/api/searches` | Optional | Adaptive | Enhanced with auth |
| `/api/execute` | Required | 30/hour | JWT or API key |
| `/api/monitoring` | Required | Standard | Admin role |
| `/api/webhooks/scheduler` | Scheduler Token | 20/15min | Special header |

## Environment Variables

Required security configuration:

```env
# JWT Configuration
JWT_SECRET=<strong-random-secret>
JWT_ISSUER=holiday-park-api
JWT_AUDIENCE=holiday-park-client

# Scheduler Security
SCHEDULER_TOKEN=<random-token>

# CORS
CORS_ORIGIN=https://app.example.com,https://www.example.com

# Rate Limiting
RATE_LIMIT_DELAY_MIN=1000
RATE_LIMIT_DELAY_MAX=3000
MAX_CONCURRENT_REQUESTS=2
```

## Usage Examples

### Generating Tokens

```bash
# Generate user token
npm run generate-token user userId email role

# Generate API key
npm run generate-token api keyId "API Key Name"
```

### Making Authenticated Requests

```bash
# With JWT token
curl -H "Authorization: Bearer <token>" https://api.example.com/api/execute/search-id

# With API key
curl -H "x-api-key: <api-key>" https://api.example.com/api/searches

# Scheduler webhook
curl -H "x-scheduler-token: <token>" -X POST https://api.example.com/api/webhooks/scheduler
```

## Security Best Practices

### For Deployment

1. **Environment Variables**
   - Never commit `.env` files
   - Use secret management services (Google Secret Manager)
   - Rotate secrets regularly

2. **HTTPS Only**
   - Always use TLS in production
   - Enable HSTS headers
   - Use secure cookies

3. **Monitoring**
   - Set up alerts for:
     - Multiple failed auth attempts
     - Rate limit violations
     - Unusual traffic patterns
     - High error rates

4. **Updates**
   - Keep dependencies updated
   - Regular security audits with `npm audit`
   - Monitor security advisories

### For Development

1. **Local Testing**
   ```bash
   # Run security tests
   ./test-security.sh
   
   # Check for vulnerabilities
   npm audit
   
   # Fix vulnerabilities
   npm audit fix
   ```

2. **Code Review Checklist**
   - [ ] Input validation on all endpoints
   - [ ] Authentication required where needed
   - [ ] No sensitive data in logs
   - [ ] Rate limiting appropriate
   - [ ] Error messages don't leak information

## Incident Response

### Rate Limit Violations
1. Check logs for IP addresses
2. Identify patterns (bot, legitimate user, attack)
3. Consider IP blocking if malicious
4. Adjust rate limits if needed

### Authentication Failures
1. Monitor for brute force attempts
2. Check for leaked credentials
3. Force password reset if compromised
4. Review audit logs

### Security Headers Missing
1. Verify Helmet middleware is loaded
2. Check for middleware order issues
3. Test with `curl -I` command
4. Review CSP violations in browser console

## Testing Security

Run the security test suite:

```bash
cd apps/api
./test-security.sh
```

Expected results:
- ✅ Health checks accessible without auth
- ✅ Protected endpoints return 401 without auth
- ✅ Rate limiting triggers after threshold
- ✅ Security headers present
- ✅ CORS properly configured
- ✅ Scheduler webhook requires token

## Compliance Considerations

### GDPR
- User data isolation via userId
- Audit trails for data access
- Secure data transmission (HTTPS)
- Authentication for personal data access

### Security Standards
- OWASP Top 10 protection
- CWE/SANS Top 25 mitigation
- Security headers per Mozilla Observatory
- Rate limiting per IETF RFC 6585

## Contact

For security issues or questions:
- Create an issue (don't include sensitive information)
- For vulnerabilities, use private disclosure
- Regular security reviews quarterly

---

*Last Updated: 2025-08-31*
*Version: 1.0.0*