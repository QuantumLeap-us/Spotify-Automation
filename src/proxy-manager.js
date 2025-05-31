const Logger = require('./logger');

class ProxyManager {
    constructor() {
        this.logger = new Logger('proxy-manager');
        this.proxies = [];
        this.failedProxies = new Set();
        this.proxyStats = new Map();
    }

    // Add proxy to the pool
    addProxy(proxy) {
        // Validate proxy format
        if (!this.validateProxy(proxy)) {
            this.logger.error('Invalid proxy format:', proxy);
            return false;
        }

        this.proxies.push(proxy);
        this.proxyStats.set(this.getProxyKey(proxy), {
            successCount: 0,
            failureCount: 0,
            lastUsed: null,
            lastSuccess: null,
            lastFailure: null
        });

        this.logger.info(`Added proxy: ${proxy.host}:${proxy.port}`);
        return true;
    }

    // Validate proxy configuration
    validateProxy(proxy) {
        return proxy && 
               proxy.host && 
               proxy.port && 
               typeof proxy.port === 'number' &&
               proxy.port > 0 && 
               proxy.port < 65536 &&
               ['http', 'https', 'socks4', 'socks5'].includes(proxy.type);
    }

    // Get proxy key for tracking
    getProxyKey(proxy) {
        return `${proxy.host}:${proxy.port}:${proxy.type}`;
    }

    // Get available proxy (not failed)
    getAvailableProxy() {
        const availableProxies = this.proxies.filter(proxy => 
            !this.failedProxies.has(this.getProxyKey(proxy))
        );

        if (availableProxies.length === 0) {
            this.logger.warn('No available proxies, resetting failed proxy list');
            this.failedProxies.clear();
            return this.proxies.length > 0 ? this.proxies[0] : null;
        }

        // Return least recently used proxy
        const sortedProxies = availableProxies.sort((a, b) => {
            const statsA = this.proxyStats.get(this.getProxyKey(a));
            const statsB = this.proxyStats.get(this.getProxyKey(b));
            
            const lastUsedA = statsA.lastUsed || 0;
            const lastUsedB = statsB.lastUsed || 0;
            
            return lastUsedA - lastUsedB;
        });

        return sortedProxies[0];
    }

    // Get random proxy
    getRandomProxy() {
        const availableProxies = this.proxies.filter(proxy => 
            !this.failedProxies.has(this.getProxyKey(proxy))
        );

        if (availableProxies.length === 0) {
            return null;
        }

        const randomIndex = Math.floor(Math.random() * availableProxies.length);
        return availableProxies[randomIndex];
    }

    // Mark proxy as used
    markProxyUsed(proxy, success = true) {
        const proxyKey = this.getProxyKey(proxy);
        const stats = this.proxyStats.get(proxyKey);
        
        if (stats) {
            stats.lastUsed = Date.now();
            
            if (success) {
                stats.successCount++;
                stats.lastSuccess = Date.now();
                // Remove from failed list if it was there
                this.failedProxies.delete(proxyKey);
                this.logger.debug(`Proxy success: ${proxy.host}:${proxy.port}`);
            } else {
                stats.failureCount++;
                stats.lastFailure = Date.now();
                // Add to failed list if failure rate is high
                if (stats.failureCount >= 3) {
                    this.failedProxies.add(proxyKey);
                    this.logger.warn(`Proxy marked as failed: ${proxy.host}:${proxy.port}`);
                }
            }
            
            this.proxyStats.set(proxyKey, stats);
        }
    }

    // Test proxy connectivity
    async testProxy(proxy) {
        try {
            this.logger.info(`Testing proxy: ${proxy.host}:${proxy.port}`);
            
            // Create a simple test using the proxy
            const { chromium } = require('playwright');
            
            const browser = await chromium.launch({
                headless: true,
                proxy: {
                    server: `${proxy.type}://${proxy.host}:${proxy.port}`,
                    username: proxy.username,
                    password: proxy.password
                }
            });

            const context = await browser.newContext();
            const page = await context.newPage();
            
            // Test with a simple request
            await page.goto('https://httpbin.org/ip', { timeout: 10000 });
            const content = await page.textContent('body');
            
            await browser.close();
            
            // Check if we got a valid response
            if (content && content.includes('origin')) {
                this.markProxyUsed(proxy, true);
                this.logger.info(`Proxy test successful: ${proxy.host}:${proxy.port}`);
                return true;
            } else {
                this.markProxyUsed(proxy, false);
                this.logger.error(`Proxy test failed: ${proxy.host}:${proxy.port}`);
                return false;
            }
            
        } catch (error) {
            this.markProxyUsed(proxy, false);
            this.logger.error(`Proxy test error for ${proxy.host}:${proxy.port}:`, error);
            return false;
        }
    }

    // Test all proxies
    async testAllProxies() {
        this.logger.info('Testing all proxies...');
        const results = [];
        
        for (const proxy of this.proxies) {
            const isWorking = await this.testProxy(proxy);
            results.push({ proxy, isWorking });
            
            // Add delay between tests to avoid overwhelming
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const workingProxies = results.filter(r => r.isWorking).length;
        this.logger.info(`Proxy test completed: ${workingProxies}/${this.proxies.length} working`);
        
        return results;
    }

    // Get proxy statistics
    getProxyStats() {
        const stats = {
            totalProxies: this.proxies.length,
            availableProxies: this.proxies.length - this.failedProxies.size,
            failedProxies: this.failedProxies.size,
            proxyDetails: []
        };

        this.proxies.forEach(proxy => {
            const proxyKey = this.getProxyKey(proxy);
            const proxyStats = this.proxyStats.get(proxyKey);
            const isFailed = this.failedProxies.has(proxyKey);
            
            stats.proxyDetails.push({
                host: proxy.host,
                port: proxy.port,
                type: proxy.type,
                status: isFailed ? 'failed' : 'available',
                successCount: proxyStats?.successCount || 0,
                failureCount: proxyStats?.failureCount || 0,
                lastUsed: proxyStats?.lastUsed,
                lastSuccess: proxyStats?.lastSuccess,
                lastFailure: proxyStats?.lastFailure
            });
        });

        return stats;
    }

    // Reset failed proxies (give them another chance)
    resetFailedProxies() {
        const failedCount = this.failedProxies.size;
        this.failedProxies.clear();
        this.logger.info(`Reset ${failedCount} failed proxies`);
    }

    // Remove proxy from pool
    removeProxy(proxy) {
        const proxyKey = this.getProxyKey(proxy);
        this.proxies = this.proxies.filter(p => this.getProxyKey(p) !== proxyKey);
        this.failedProxies.delete(proxyKey);
        this.proxyStats.delete(proxyKey);
        
        this.logger.info(`Removed proxy: ${proxy.host}:${proxy.port}`);
    }

    // Load proxies from configuration
    loadProxies(proxiesConfig) {
        this.proxies = [];
        this.failedProxies.clear();
        this.proxyStats.clear();
        
        if (Array.isArray(proxiesConfig)) {
            proxiesConfig.forEach(proxy => {
                this.addProxy(proxy);
            });
        }
        
        this.logger.info(`Loaded ${this.proxies.length} proxies`);
    }
}

module.exports = ProxyManager;
