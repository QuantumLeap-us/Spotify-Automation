# Technical Implementation Guide

## Development Requirements Update

Based on the conversation analysis with aarchiedouglas1, the following technical requirements have been identified:

### Core Implementation Requirements

1. **Browser Farm Orchestration**
   - 50+ headless Chromium sessions via Docker
   - Session lifecycle management
   - Auto-scaling capabilities
   - Resource optimization

2. **Skip/Jitter Behavior Logic**
   - 40s, 55s, 180s skip patterns with ±5s jitter
   - Randomized pause behavior
   - Natural listening simulation
   - Session length variation

3. **Shift Scheduling System**
   - AM/PM/Night window staggering
   - Capacity management per time window
   - Geographic time zone consideration
   - Load balancing across shifts

4. **Monitoring & Dashboard**
   - Success/failure logs per session
   - Heartbeat ping system
   - Crash tracking and recovery
   - CLI and web dashboard interface

5. **Proxy Integration**
   - Smartproxy pool compatibility
   - Session-based rotation (not time-based)
   - Health monitoring and failover
   - Geographic consistency

## Architecture Implementation

### Session Manager Core
```javascript
class SessionManager {
    constructor() {
        this.sessions = new Map();
        this.scheduler = new ShiftScheduler();
        this.monitor = new HealthMonitor();
        this.maxConcurrent = 50;
    }
    
    async createSession(config) {
        const session = new SpotifySession({
            proxy: this.selectProxy(),
            behavior: this.generateBehaviorProfile(),
            schedule: this.scheduler.getNextSlot()
        });
        
        this.sessions.set(session.id, session);
        return session;
    }
    
    async manageLifecycle() {
        for (const [id, session] of this.sessions) {
            if (session.shouldRestart()) {
                await this.restartSession(id);
            }
            
            if (session.isHealthy()) {
                this.monitor.recordHeartbeat(id);
            } else {
                await this.handleUnhealthySession(id);
            }
        }
    }
}
```

### Skip/Jitter Implementation
```javascript
class BehaviorEngine {
    constructor() {
        this.skipPatterns = {
            short: { duration: 40, jitter: 5 },
            medium: { duration: 55, jitter: 5 },
            long: { duration: 180, jitter: 5 }
        };
    }
    
    generateSkipSequence(trackLength) {
        const pattern = this.selectRandomPattern();
        const baseTime = pattern.duration;
        const jitter = (Math.random() - 0.5) * 2 * pattern.jitter;
        const skipTime = Math.max(5, Math.min(trackLength - 5, baseTime + jitter));
        
        return {
            skipAt: skipTime,
            reason: this.generateSkipReason(),
            nextAction: this.planNextAction()
        };
    }
    
    selectRandomPattern() {
        const patterns = Object.values(this.skipPatterns);
        const weights = [0.4, 0.4, 0.2]; // 40% short, 40% medium, 20% long
        return this.weightedRandom(patterns, weights);
    }
    
    generateNaturalPause() {
        // Simulate natural user pauses between tracks
        const pauseTypes = {
            quick: { min: 1, max: 3 },      // Quick transition
            normal: { min: 3, max: 8 },     // Normal pause
            long: { min: 8, max: 15 }       // Browsing pause
        };
        
        const type = this.selectPauseType();
        const pause = pauseTypes[type];
        return Math.random() * (pause.max - pause.min) + pause.min;
    }
}
```

### Shift Scheduler Implementation
```javascript
class ShiftScheduler {
    constructor() {
        this.shifts = {
            morning: { start: 6, end: 12, capacity: 0.3 },   // 30% capacity
            afternoon: { start: 12, end: 18, capacity: 1.0 }, // 100% capacity
            night: { start: 18, end: 6, capacity: 0.5 }      // 50% capacity
        };
        
        this.maxSessions = 50;
    }
    
    getCurrentShift() {
        const hour = new Date().getHours();
        
        if (hour >= 6 && hour < 12) return 'morning';
        if (hour >= 12 && hour < 18) return 'afternoon';
        return 'night';
    }
    
    getActiveSessionCount() {
        const shift = this.getCurrentShift();
        const capacity = this.shifts[shift].capacity;
        return Math.floor(this.maxSessions * capacity);
    }
    
    shouldStartNewSession() {
        const currentActive = this.getActiveSessionsCount();
        const allowedActive = this.getActiveSessionCount();
        return currentActive < allowedActive;
    }
    
    scheduleShiftTransition() {
        // Gradually transition between shifts to avoid detection
        const transitionDuration = 30; // 30 minutes
        const currentShift = this.getCurrentShift();
        const nextShift = this.getNextShift();
        
        return {
            current: currentShift,
            next: nextShift,
            transitionStart: this.getNextShiftTime() - transitionDuration * 60 * 1000,
            transitionEnd: this.getNextShiftTime()
        };
    }
}
```

### Monitoring System
```javascript
class MonitoringSystem {
    constructor() {
        this.metrics = new MetricsCollector();
        this.logger = new StructuredLogger();
        this.dashboard = new WebDashboard();
        this.alerts = new AlertManager();
    }
    
    recordSessionEvent(sessionId, event, data) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            sessionId,
            event,
            data,
            shift: this.scheduler.getCurrentShift()
        };
        
        this.logger.info(logEntry);
        this.metrics.increment(`session.${event}`);
        
        if (event === 'error' || event === 'crash') {
            this.alerts.trigger('session_failure', logEntry);
        }
    }
    
    generateHealthReport() {
        return {
            totalSessions: this.sessions.size,
            activeSessions: this.getActiveSessions().length,
            successRate: this.metrics.getSuccessRate(),
            averageSessionDuration: this.metrics.getAverageSessionDuration(),
            proxyHealth: this.proxyManager.getHealthStatus(),
            systemResources: this.getSystemResources(),
            uptime: this.getSystemUptime()
        };
    }
    
    startHeartbeatMonitoring() {
        setInterval(() => {
            for (const session of this.sessions.values()) {
                if (session.isActive()) {
                    this.recordSessionEvent(session.id, 'heartbeat', {
                        status: session.getStatus(),
                        currentTrack: session.getCurrentTrack(),
                        playTime: session.getPlayTime()
                    });
                }
            }
        }, 30000); // Every 30 seconds
    }
}
```

### Docker Implementation
```dockerfile
# Multi-stage build for production optimization
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM mcr.microsoft.com/playwright:v1.40.0-focal AS runtime
WORKDIR /app

# Copy application code
COPY --from=base /app/node_modules ./node_modules
COPY . .

# Install Chromium
RUN npx playwright install chromium

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S spotify -u 1001
USER spotify

# Health check endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000 8080
CMD ["npm", "start"]
```

### Docker Compose for Scaling
```yaml
version: '3.8'

services:
  session-manager:
    build: .
    ports:
      - "3000:3000"
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - SESSION_COUNT=50
      - PROXY_PROVIDER=smartproxy
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
    restart: unless-stopped

  worker:
    build: .
    environment:
      - NODE_ENV=production
      - WORKER_MODE=true
    volumes:
      - ./config:/app/config
      - ./logs:/app/logs
    restart: unless-stopped
    depends_on:
      - session-manager

  dashboard:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DASHBOARD_ONLY=true
    volumes:
      - ./logs:/app/logs
    restart: unless-stopped

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-storage:/var/lib/grafana

volumes:
  grafana-storage:
```

### Proxy Management
```javascript
class SmartproxyManager {
    constructor(config) {
        this.config = config;
        this.proxyPool = new Map();
        this.healthChecker = new ProxyHealthChecker();
        this.rotationStrategy = 'session-based';
    }
    
    async initializePool() {
        const proxies = await this.fetchProxyList();
        
        for (const proxy of proxies) {
            const health = await this.healthChecker.test(proxy);
            if (health.isHealthy) {
                this.proxyPool.set(proxy.id, {
                    ...proxy,
                    health,
                    assignedSessions: 0,
                    lastUsed: null
                });
            }
        }
    }
    
    selectProxyForSession(sessionId) {
        // Session-based selection (not time-based rotation)
        const availableProxies = Array.from(this.proxyPool.values())
            .filter(proxy => proxy.health.isHealthy)
            .filter(proxy => proxy.assignedSessions < 3) // Max 3 sessions per proxy
            .sort((a, b) => a.assignedSessions - b.assignedSessions);
        
        if (availableProxies.length === 0) {
            throw new Error('No healthy proxies available');
        }
        
        const selectedProxy = availableProxies[0];
        selectedProxy.assignedSessions++;
        selectedProxy.lastUsed = new Date();
        
        return selectedProxy;
    }
    
    async handleProxyFailure(proxyId, sessionId) {
        const proxy = this.proxyPool.get(proxyId);
        if (proxy) {
            proxy.health.isHealthy = false;
            proxy.assignedSessions = Math.max(0, proxy.assignedSessions - 1);
            
            // Schedule health recheck
            setTimeout(() => {
                this.healthChecker.test(proxy).then(health => {
                    proxy.health = health;
                });
            }, 5 * 60 * 1000); // Recheck in 5 minutes
        }
        
        // Find replacement proxy for the session
        return this.selectProxyForSession(sessionId);
    }
}
```

## Configuration System

### Behavior Configuration
```yaml
# config/behavior.yaml
skip_patterns:
  short:
    duration: 40
    jitter: 5
    weight: 0.4
  medium:
    duration: 55
    jitter: 5
    weight: 0.4
  long:
    duration: 180
    jitter: 5
    weight: 0.2

pause_patterns:
  quick:
    min: 1
    max: 3
    weight: 0.3
  normal:
    min: 3
    max: 8
    weight: 0.5
  long:
    min: 8
    max: 15
    weight: 0.2

session_lengths:
  short:
    tracks: [1, 3]
    duration: [60, 180]
  medium:
    tracks: [3, 8]
    duration: [180, 480]
  long:
    tracks: [8, 15]
    duration: [480, 900]
```

### Schedule Configuration
```yaml
# config/schedule.yaml
shifts:
  morning:
    start_hour: 6
    end_hour: 12
    capacity: 0.3
    timezone: "UTC"
  afternoon:
    start_hour: 12
    end_hour: 18
    capacity: 1.0
    timezone: "UTC"
  night:
    start_hour: 18
    end_hour: 6
    capacity: 0.5
    timezone: "UTC"

transition:
  duration_minutes: 30
  gradual_scaling: true
  overlap_allowed: true
```

This technical implementation provides a robust foundation for the production-grade Spotify automation farm, addressing all specified requirements while maintaining scalability and reliability.
