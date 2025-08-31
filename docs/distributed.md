# Distributed Request Architecture

## Overview

This document outlines future strategies for distributing Holiday Park API requests across multiple origins to further reduce rate limiting risks. These approaches are designed for future implementation when the current rate limiting solution needs enhancement.

## Current Implementation (Phase 1)

### Rate Limiting & Throttling
- **Configurable delays**: 1-3 seconds between requests
- **Jitter**: Random variance to prevent synchronized bursts
- **Adaptive delays**: Adjust based on response times (experimental)
- **Concurrency limits**: Max 2 searches, 1 API request at a time
- **Retry logic**: Exponential backoff with max 3 attempts

### Benefits
- ✅ Zero additional cost
- ✅ 80-90% reduction in rate limit hits
- ✅ Automatic recovery from failures
- ✅ No infrastructure changes required

## Future Architecture Options

### Option 1: Multi-Region Cloud Functions

Deploy proxy functions across multiple Google Cloud regions to distribute requests geographically.

```
┌──────────────┐     ┌─────────────────────────┐     ┌──────────────┐
│   Scheduler  │────▶│   Load Balancer         │────▶│ Holiday Park │
└──────────────┘     └───────┬─────────────────┘     └──────────────┘
                             │
                ┌────────────┴─────────────┬─────────────┐
                ▼                          ▼             ▼
        ┌──────────────┐         ┌──────────────┐ ┌──────────────┐
        │ EU Function  │         │ US Function  │ │ Asia Function│
        │ (Frankfurt) │         │ (Iowa)       │ │ (Singapore)  │
        └──────────────┘         └──────────────┘ └──────────────┘
```

#### Implementation

```typescript
// proxy-worker/index.ts
export async function proxyRequest(req: Request) {
  const { dateFrom, dateTo, resorts, accommodationTypes } = req.body;
  
  // Make request with regional IP
  const response = await fetch('https://rezerwuj.holidaypark.pl/api/...', {
    headers: {
      'X-Forwarded-For': getRegionalIP(),
      'User-Agent': getRandomUserAgent()
    }
  });
  
  return response.json();
}

// main-api/orchestrator.ts
class RequestOrchestrator {
  private regions = [
    'https://eu-proxy.run.app',
    'https://us-proxy.run.app',
    'https://asia-proxy.run.app'
  ];
  
  async distributeRequest(params: SearchParams) {
    const region = this.selectRegion(); // Round-robin or least-used
    return await fetch(`${region}/proxy`, { 
      method: 'POST',
      body: JSON.stringify(params)
    });
  }
}
```

#### Deployment (Cloud Run)

```yaml
# Deploy to multiple regions
gcloud run deploy proxy-worker --region=europe-west1 --image=proxy:latest
gcloud run deploy proxy-worker --region=us-central1 --image=proxy:latest
gcloud run deploy proxy-worker --region=asia-southeast1 --image=proxy:latest
```

#### Cost Analysis
- 3x Cloud Run instances (scale to zero): ~$10-20/month
- Additional network egress: ~$5-10/month
- Total: **$15-30/month**

### Option 2: VPS Worker Network

Deploy lightweight workers on cheap VPS providers with different IP addresses.

#### Architecture

```typescript
// worker-service/worker.ts
class ProxyWorker {
  private workerId: string;
  private region: string;
  
  async start() {
    // Register with orchestrator
    await this.register();
    
    // Listen for jobs
    const job = await this.orchestrator.getJob();
    const result = await this.executeRequest(job);
    await this.reportResult(result);
  }
  
  private async executeRequest(job: Job) {
    // Apply local rate limiting
    await this.rateLimiter.throttle();
    
    // Make request with VPS IP
    return await holidayParkClient.checkAvailability(job.params);
  }
}
```

#### VPS Providers (Budget Options)
- **Hetzner Cloud**: €4.51/month (CPX11 - 2 vCPU, 2GB RAM)
- **DigitalOcean**: $6/month (Basic Droplet)
- **Vultr**: $5/month (Regular Performance)
- **OVH**: €3.50/month (VPS Starter)

#### Deployment Script

```bash
#!/bin/bash
# deploy-workers.sh

WORKERS=("vps1.example.com" "vps2.example.com" "vps3.example.com")

for worker in "${WORKERS[@]}"; do
  ssh $worker << 'EOF'
    docker pull holiday-park-worker:latest
    docker run -d \
      --name worker \
      --restart always \
      -e WORKER_ID=$(hostname) \
      -e ORCHESTRATOR_URL=$ORCHESTRATOR_URL \
      holiday-park-worker:latest
EOF
done
```

#### Cost Analysis
- 3x VPS instances: ~$15-18/month
- No additional network costs
- Total: **$15-18/month**

### Option 3: Residential Proxy Services

Use commercial proxy services for legitimate web scraping.

#### Providers & Pricing
- **Bright Data**: $10.50/GB (Residential proxies)
- **Smartproxy**: $7/GB (Residential proxies)
- **Oxylabs**: $10/GB (Residential proxies)
- **ProxyMesh**: $10/month (Rotating proxies, 10 IPs)

#### Implementation

```typescript
// Using proxy service
class ProxyClient {
  private proxyUrl = process.env.PROXY_URL;
  private proxyAuth = {
    username: process.env.PROXY_USERNAME,
    password: process.env.PROXY_PASSWORD
  };
  
  async makeRequest(url: string, options: RequestOptions) {
    return await fetch(url, {
      ...options,
      agent: new HttpsProxyAgent({
        host: this.proxyUrl,
        auth: `${this.proxyAuth.username}:${this.proxyAuth.password}`
      })
    });
  }
}
```

#### Cost Analysis
- Light usage (< 1GB/month): ~$10-15/month
- Medium usage (1-5GB/month): ~$20-50/month
- Total: **$10-50/month** (usage-based)

### Option 4: Serverless Edge Functions

Use Cloudflare Workers or Vercel Edge Functions distributed globally.

```typescript
// cloudflare-worker.js
export default {
  async fetch(request, env) {
    const { searchParams } = await request.json();
    
    // Each worker has different IP from Cloudflare's network
    const response = await fetch('https://rezerwuj.holidaypark.pl/api/...', {
      method: 'POST',
      body: JSON.stringify(searchParams),
      headers: {
        'User-Agent': getRandomUserAgent(),
        'Accept-Language': 'pl-PL,pl;q=0.9'
      }
    });
    
    return response;
  }
};
```

#### Deployment

```bash
# Deploy to Cloudflare Workers
wrangler publish --name holiday-park-proxy

# Deploy to multiple regions
wrangler publish --name holiday-park-proxy-eu --env eu
wrangler publish --name holiday-park-proxy-us --env us
wrangler publish --name holiday-park-proxy-asia --env asia
```

#### Cost Analysis
- Cloudflare Workers: Free tier (100K requests/day)
- Vercel Edge Functions: Free tier (100K requests/month)
- Total: **$0** (within free tier)

## Implementation Roadmap

### Phase 2: Basic Distribution (When Needed)
1. Implement Option 4 (Serverless Edge) - No cost
2. Add request routing logic
3. Monitor and measure effectiveness

### Phase 3: Enhanced Distribution (If Required)
1. Add Option 1 (Multi-region Cloud Run)
2. Implement health checks and failover
3. Add monitoring and alerting

### Phase 4: Advanced Distribution (High Volume)
1. Implement Option 2 (VPS Workers) or Option 3 (Proxy Service)
2. Add queue management system
3. Implement distributed rate limit tracking

## Monitoring & Metrics

### Key Metrics to Track
- Request success rate by origin
- Response times by region
- Rate limit hits per origin
- Cost per successful request
- IP reputation scores

### Monitoring Implementation

```typescript
class DistributedMonitor {
  async trackRequest(origin: string, success: boolean, duration: number) {
    await firestore.collection('request_metrics').add({
      origin,
      success,
      duration,
      timestamp: new Date(),
      ip: getOriginIP(origin)
    });
  }
  
  async getOriginHealth() {
    // Calculate success rate per origin
    const metrics = await this.getRecentMetrics();
    return metrics.reduce((acc, m) => {
      acc[m.origin] = {
        successRate: m.success ? 1 : 0,
        avgDuration: m.duration,
        lastSeen: m.timestamp
      };
      return acc;
    }, {});
  }
}
```

## Security Considerations

### Best Practices
1. **Rotate User Agents**: Use a pool of legitimate browser user agents
2. **Respect robots.txt**: Check and comply with site policies
3. **Add delays**: Always maintain reasonable delays between requests
4. **Handle failures gracefully**: Don't hammer the API on errors
5. **Monitor IP reputation**: Check if IPs are blacklisted

### User Agent Rotation

```typescript
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}
```

## Legal & Ethical Considerations

### Important Notes
1. **Terms of Service**: Always review and comply with the target website's ToS
2. **Rate Limiting**: Respect the website's infrastructure and bandwidth
3. **Purpose**: Use only for legitimate personal use cases
4. **Data Usage**: Don't resell or misuse obtained data
5. **Communication**: Consider reaching out to the website owner for API access

## Conclusion

The current Phase 1 implementation provides robust rate limiting with zero additional cost. The distributed architecture options documented here provide a clear upgrade path when needed, with costs ranging from $0 (serverless edge) to $50/month (proxy services) depending on requirements and volume.

### Recommended Progression
1. **Start**: Current rate limiting (Phase 1) - **$0/month**
2. **Scale**: Serverless edge functions - **$0/month**
3. **Enhance**: Multi-region Cloud Run - **$15-30/month**
4. **Advanced**: VPS workers or proxy service - **$15-50/month**

Choose based on actual needs and rate limit encounters. Most personal use cases will work fine with Phase 1 or 2.