const Logger = require('./logger');

// Placeholder for ProxyHealthChecker
class ProxyHealthChecker {
    constructor() {
        this.logger = new Logger('proxy-health-checker');
    }

    async test(proxy) {
        this.logger.info(`Health checking proxy: ${proxy.host}:${proxy.port}`);
        // Simulate an async health check
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate network delay
        // In a real scenario, this would involve making a request through the proxy
        // and checking for success, status code, latency, IP change, etc.
        const isHealthy = Math.random() > 0.2; // Simulate 80% healthy
        const latency = 50 + Math.floor(Math.random() * 200); // Simulate latency 50-250ms
        this.logger.info(`Proxy ${proxy.host}:${proxy.port} health: ${isHealthy ? 'Healthy' : 'Unhealthy'}, Latency: ${latency}ms`);
        return { isHealthy, latency };
    }
}

class SmartproxyManager {
    constructor(configManager, logger) {
        this.logger = logger || new Logger('smartproxy-manager');
        this.configManager = configManager;
        // Load configuration for proxies from 'proxies.yaml'
        // The 'loadConfig' method in ConfigManager should handle returning null if file doesn't exist or is empty.
        this.proxyConfig = this.configManager.loadConfig('proxies.yaml') || {};

        this.proxyPool = new Map(); // Stores proxy objects, keyed by proxy.id
        this.healthChecker = new ProxyHealthChecker();

        // Default rotation strategy, can be made configurable via proxies.yaml if needed
        this.rotationStrategy = this.proxyConfig.rotationStrategy || 'session-based';

        this.logger.info(`SmartproxyManager initialized. Rotation strategy: ${this.rotationStrategy}.`);
        if (!this.proxyConfig || Object.keys(this.proxyConfig).length === 0) {
            this.logger.warn('Proxies configuration (proxies.yaml) is empty or not found. Manager may operate with a limited or empty pool until configured.');
        }
    }

    /**
     * Fetches the list of proxies.
     * Placeholder: Returns a hardcoded list.
     * TODO: Implement fetching from Smartproxy API or a dynamic source.
     */
    async fetchProxyList() {
        this.logger.info('Fetching proxy list (placeholder implementation)...');
        // Attempt to get predefined proxies from config first
        if (this.proxyConfig && this.proxyConfig.predefined_proxies && this.proxyConfig.predefined_proxies.length > 0) {
            this.logger.info(`Using predefined proxies from proxies.yaml.`);
            return this.proxyConfig.predefined_proxies;
        }

        // Fallback to hardcoded list if no predefined_proxies
        this.logger.warn('No predefined proxies in config, using hardcoded list for example purposes.');
        return [
            { id: 'proxy1', host: 'proxy1.example.com', port: 8080, username: 'user1', password: 'pwd1', type: 'http' },
            { id: 'proxy2', host: 'proxy2.example.com', port: 8081, username: 'user2', password: 'pwd2', type: 'http' },
            { id: 'proxy3', host: 'proxy3.example.com', port: 8082, username: 'user3', password: 'pwd3', type: 'http' },
            { id: 'proxy4', host: 'proxy4.example.com', port: 8083, username: 'user4', password: 'pwd4', type: 'http' },
            { id: 'proxy5', host: 'proxy5.example.com', port: 8084, username: 'user5', password: 'pwd5', type: 'http' },
        ];
    }

    /**
     * Initializes the proxy pool by fetching and health-checking proxies.
     */
    async initializePool() {
        this.logger.info('Initializing proxy pool...');
        this.proxyPool.clear(); // Clear existing pool before re-initializing

        const fetchedProxies = await this.fetchProxyList();

        if (!fetchedProxies || fetchedProxies.length === 0) {
            this.logger.warn('No proxies fetched or available to initialize the pool.');
            return;
        }

        let healthyCount = 0;
        for (const proxy of fetchedProxies) {
            if (!proxy.host || !proxy.port) {
                this.logger.warn('Skipping proxy with missing host or port:', proxy);
                continue;
            }
            const proxyId = proxy.id || `${proxy.host}:${proxy.port}`; // Ensure an ID
            const health = await this.healthChecker.test(proxy);
            if (health.isHealthy) {
                this.proxyPool.set(proxyId, {
                    ...proxy,
                    id: proxyId, // Ensure id is set
                    health,
                    assignedSessions: 0,
                    lastUsed: null,
                    consecutiveFailures: 0, // For more advanced failure handling
                });
                healthyCount++;
            } else {
                this.logger.warn(`Proxy ${proxyId} failed initial health check. Not adding to active pool.`);
                // Optionally, add to pool but mark as unhealthy for later re-check
                 this.proxyPool.set(proxyId, {
                    ...proxy,
                    id: proxyId,
                    health, // isHealthy will be false
                    assignedSessions: 0,
                    lastUsed: null,
                    consecutiveFailures: 1,
                });
            }
        }
        this.logger.info(`Proxy pool initialized. ${healthyCount} healthy proxies out of ${fetchedProxies.length} added to the pool.`);
        if (healthyCount === 0) {
            this.logger.error('No healthy proxies available after initialization. Session creation may fail.');
        }
    }

    /**
     * Selects an available and healthy proxy for a new session.
     * @param {string} sessionId - The ID of the session requesting a proxy.
     * @returns {Object|null} The selected proxy object or null if none are available.
     */
    selectProxyForSession(sessionId) {
        this.logger.debug(`Attempting to select proxy for session ${sessionId}. Pool size: ${this.proxyPool.size}`);
        const maxSessionsPerProxy = this.proxyConfig.maxSessionsPerProxy || 3;

        const availableProxies = Array.from(this.proxyPool.values())
            .filter(proxy => proxy.health && proxy.health.isHealthy) // Check health object and its status
            .filter(proxy => proxy.assignedSessions < maxSessionsPerProxy)
            .sort((a, b) => {
                // Prioritize by fewest assigned sessions
                if (a.assignedSessions !== b.assignedSessions) {
                    return a.assignedSessions - b.assignedSessions;
                }
                // Then by least recently used (nulls last, or oldest first)
                if (!a.lastUsed && b.lastUsed) return -1; // a (null) comes before b (date)
                if (a.lastUsed && !b.lastUsed) return 1;  // b (null) comes before a (date)
                if (!a.lastUsed && !b.lastUsed) return 0; // both null
                return new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime();
            });

        if (availableProxies.length === 0) {
            this.logger.error(`No available healthy proxies for session ${sessionId}. Max sessions per proxy: ${maxSessionsPerProxy}. Total healthy in pool: ${Array.from(this.proxyPool.values()).filter(p => p.health && p.health.isHealthy).length}`);
            return null; // Or throw new Error('No available proxies');
        }

        const selectedProxy = availableProxies[0];
        selectedProxy.assignedSessions++;
        selectedProxy.lastUsed = new Date();
        this.proxyPool.set(selectedProxy.id, selectedProxy); // Update the pool map

        this.logger.info(`Selected proxy ${selectedProxy.id} (${selectedProxy.host}) for session ${sessionId}. Assigned sessions: ${selectedProxy.assignedSessions}/${maxSessionsPerProxy}.`);
        return { // Return a copy of essential details, not the internal object directly
            id: selectedProxy.id,
            host: selectedProxy.host,
            port: selectedProxy.port,
            username: selectedProxy.username,
            password: selectedProxy.password,
            type: selectedProxy.type || 'http' // Ensure type is present
        };
    }

    /**
     * Releases a proxy, decrementing its assigned session count.
     * @param {string} proxyIdOrHost - The ID or host:port of the proxy to release.
     */
    releaseProxy(proxyIdOrHost) {
        const proxy = this.proxyPool.get(proxyIdOrHost);
        if (proxy) {
            proxy.assignedSessions = Math.max(0, proxy.assignedSessions - 1);
            this.proxyPool.set(proxy.id, proxy); // Update the pool map
            this.logger.info(`Released proxy ${proxyIdOrHost}. Current assigned sessions: ${proxy.assignedSessions}.`);
        } else {
            this.logger.warn(`Attempted to release non-existent or unknown proxy: ${proxyIdOrHost}`);
        }
    }

    /**
     * Handles a reported proxy failure. Marks proxy as unhealthy and schedules a re-check.
     * Attempts to provide a replacement proxy for the session.
     * @param {string} proxyIdOrHost - The ID or host:port of the failed proxy.
     * @param {string} sessionId - The ID of the session that experienced the failure.
     * @returns {Object|null} A new proxy for the session, or null if none available.
     */
    async handleProxyFailure(proxyIdOrHost, sessionId) {
        this.logger.warn(`Handling failure for proxy ${proxyIdOrHost} used by session ${sessionId}.`);
        const proxy = this.proxyPool.get(proxyIdOrHost);

        if (proxy) {
            proxy.health = { isHealthy: false, latency: proxy.health?.latency || -1, lastCheck: new Date() }; // Mark as unhealthy
            proxy.consecutiveFailures = (proxy.consecutiveFailures || 0) + 1;
            // Decrement assignedSessions as the session using it failed with this proxy
            proxy.assignedSessions = Math.max(0, proxy.assignedSessions - 1);
            this.proxyPool.set(proxy.id, proxy); // Update the pool map

            const recheckInterval = this.proxyConfig.recheckIntervalMs || 5 * 60 * 1000; // 5 minutes default
            this.logger.info(`Scheduling health re-check for proxy ${proxy.id} in ${recheckInterval / 1000}s.`);

            setTimeout(async () => {
                this.logger.info(`Rechecking health for proxy ${proxy.id}...`);
                const health = await this.healthChecker.test(proxy);
                proxy.health = health; // Update health status
                if (health.isHealthy) {
                    proxy.consecutiveFailures = 0; // Reset failures on health recovery
                    this.logger.info(`Proxy ${proxy.id} (${proxy.host}) is healthy again after re-check.`);
                } else {
                    this.logger.warn(`Proxy ${proxy.id} (${proxy.host}) is still unhealthy after re-check. Consecutive failures: ${proxy.consecutiveFailures}.`);
                    // Implement further logic if needed, e.g., remove proxy from pool after N failures
                    if (proxy.consecutiveFailures >= (this.proxyConfig.maxFailuresBeforeRemoval || 3)) {
                        this.logger.error(`Proxy ${proxy.id} reached max consecutive failures. Removing from pool.`);
                        this.proxyPool.delete(proxy.id);
                    }
                }
                 this.proxyPool.set(proxy.id, proxy); // Update the pool map
            }, recheckInterval);
        } else {
            this.logger.error(`Could not handle failure for unknown proxy: ${proxyIdOrHost}`);
        }

        this.logger.info(`Attempting to find replacement proxy for session ${sessionId}...`);
        return this.selectProxyForSession(sessionId); // Attempt to get a new one
    }

    /**
     * Provides statistics about the current proxy pool.
     * @returns {Object} An object containing proxy statistics.
     */
    getProxyStats() {
        const totalProxies = this.proxyPool.size;
        let healthyProxies = 0;
        let totalAssignedSessions = 0;

        this.proxyPool.forEach(proxy => {
            if (proxy.health && proxy.health.isHealthy) {
                healthyProxies++;
            }
            totalAssignedSessions += proxy.assignedSessions;
        });

        return {
            totalProxies,
            healthyProxies,
            unhealthyProxies: totalProxies - healthyProxies,
            totalAssignedSessions,
            maxSessionsPerProxyConfig: this.proxyConfig.maxSessionsPerProxy || 3,
            rotationStrategy: this.rotationStrategy
        };
    }
}

module.exports = SmartproxyManager;
