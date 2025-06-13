const Logger = require('./logger');
const os = require('os'); // For actual system resource monitoring in future

// Placeholder for MetricsCollector
class MetricsCollector {
    constructor(logger) {
        this.metrics = new Map();
        this.logger = logger || new Logger('metrics-collector');
    }

    increment(metricName, value = 1) {
        const currentMetricValue = this.metrics.get(metricName) || 0;
        this.metrics.set(metricName, currentMetricValue + value);
        this.logger.debug(`Metric '${metricName}' incremented to ${this.metrics.get(metricName)}`);
    }

    set(metricName, value) {
        this.metrics.set(metricName, value);
        this.logger.debug(`Metric '${metricName}' set to ${value}`);
    }

    getMetric(metricName) {
        return this.metrics.get(metricName) || 0;
    }

    getAllMetrics() {
        return Object.fromEntries(this.metrics);
    }

    // Placeholder - actual implementation would require tracking session outcomes
    getSuccessRate() {
        const completed = this.getMetric('session.completed') || 0;
        const failed = this.getMetric('session.failed') || 0;
        const totalEnded = completed + failed;
        if (totalEnded === 0) return 1; // Avoid division by zero, 100% success if no sessions ended
        return parseFloat((completed / totalEnded).toFixed(2));
    }

    // Placeholder - actual implementation would require tracking session durations
    getAverageSessionDuration() { // in seconds
        // This would need total duration of completed sessions / number of completed sessions
        return 300; // Placeholder: 5 minutes
    }
}

// Placeholder for AlertManager
class AlertManager {
    constructor(logger) {
        this.logger = logger || new Logger('alert-manager');
    }

    trigger(alertType, data) {
        this.logger.warn(`ALERT TRIGGERED: ${alertType}`, data);
        // In a real system, this would integrate with PagerDuty, Slack, email, etc.
        // Example: if (alertType === 'low_success_rate' && data.successRate < 0.7) { /* send critical alert */ }
    }
}

class MonitoringSystem {
    constructor(configManager, sessionManager, proxyManager, shiftScheduler, dashboard) {
        this.logger = new Logger('monitoring-system');
        this.metrics = new MetricsCollector(this.logger.getChildLogger('metrics'));
        this.alerts = new AlertManager(this.logger.getChildLogger('alerts'));

        // Dedicated logger for structured session events (e.g., for log shipping to ELK/Splunk)
        this.structuredLogger = new Logger('session-events');
        this.structuredLogger.info('Structured session event logging initialized.'); // Test message

        this.dashboard = dashboard; // Store the passed dashboard instance
        this.sessionManager = sessionManager;
        this.proxyManager = proxyManager;
        this.shiftScheduler = shiftScheduler;
        this.configManager = configManager;

        this.systemStartTime = new Date();
        this.heartbeatIntervalId = null;

        this.logger.info('MonitoringSystem initialized.');
    }

    /**
     * Records a structured event for a session.
     * @param {string} sessionId - The ID of the session.
     * @param {string} event - The name of the event (e.g., 'created', 'started_stream', 'error').
     * @param {Object} data - Additional data associated with the event.
     */
    recordSessionEvent(sessionId, event, data = {}) {
        const timestamp = new Date().toISOString();
        const currentShift = this.shiftScheduler ? this.shiftScheduler.getCurrentShift()?.name || this.shiftScheduler.getCurrentShift() || 'unknown' : 'unknown_scheduler_not_ready';

        const logEntry = {
            timestamp,
            sessionId,
            event,
            shift: currentShift,
            details: data, // Keep all additional data under a 'details' key for structure
        };

        // Log to dedicated structured logger
        this.structuredLogger.info(JSON.stringify(logEntry)); // Serialize to make it one line if logger doesn't do it.

        // Increment metric for this event type
        this.metrics.increment(`session.${event}`);
        if(data.errorType) { // e.g. login_error, playback_error
             this.metrics.increment(`session.error.${data.errorType}`);
        }


        // Trigger alerts for critical events
        const criticalEvents = ['error', 'crash', 'critical_failure', 'login_failed_max_retries', 'proxy_unavailable_critical'];
        if (criticalEvents.includes(event) || data.isCritical) {
            this.alerts.trigger(`session.${event}`, logEntry);
        }
    }

    /**
     * Generates a comprehensive health report for the system.
     * @returns {Promise<Object>} A promise that resolves to the health report object.
     */
    async generateHealthReport() {
        this.logger.debug('Generating system health report...');
        let activeSessionsCount = 0;
        let sessionStatsSummary = {};

        if (this.sessionManager) {
            // Assuming getSessionStatsSummary is synchronous as per its current implementation
             sessionStatsSummary = this.sessionManager.getSessionStatsSummary();
             activeSessionsCount = sessionStatsSummary.operationallyActiveSessions ||
                                  (this.sessionManager.sessions ? this.sessionManager.sessions.size : 0);
        }

        let proxyStats = { total: 0, healthy: 0, unhealthy: 0, totalAssignedSessions: 0 };
        if (this.proxyManager && typeof this.proxyManager.getProxyStats === 'function') {
            // Assuming getProxyStats is synchronous. If it were async:
            // proxyStats = await this.proxyManager.getProxyStats();
            proxyStats = this.proxyManager.getProxyStats();
        }

        const currentShiftDetails = this.shiftScheduler ? this.shiftScheduler.getCurrentShift(new Date()) : 'unknown_scheduler';
        const currentShiftName = (typeof currentShiftDetails === 'object' && currentShiftDetails !== null) ? currentShiftDetails.name : currentShiftDetails;


        return {
            overallStatus: "OK", // TODO: More sophisticated status based on thresholds
            timestamp: new Date().toISOString(),
            uptime: this.getSystemUptime(),
            currentShift: currentShiftName,
            maxConcurrentSessions: this.sessionManager ? this.sessionManager.maxConcurrent : 'N/A',
            systemResources: this.getSystemResources(), // Placeholder
            metrics: this.metrics.getAllMetrics(),
            sessionSummary: sessionStatsSummary, // Detailed stats from SessionManager
            proxySummary: proxyStats,
            // Individual component health (placeholders for more detailed checks)
            componentHealth: {
                sessionManager: this.sessionManager ? "OK" : "Not Available",
                proxyManager: this.proxyManager ? "OK" : "Not Available",
                shiftScheduler: this.shiftScheduler ? "OK" : "Not Available",
                // ConfigManager is usually implicitly OK if app starts
            },
            // Alerts (placeholder - could list recent or active alerts)
            activeAlerts: [],
        };
    }

    /**
     * Placeholder for getting system resource usage.
     * @returns {Object}
     */
    getSystemResources() {
        // In a real implementation, use 'os' module or other libraries
        // const freeMem = os.freemem();
        // const totalMem = os.totalmem();
        // const usedMem = totalMem - freeMem;
        return {
            cpuUsage: 'N/A', // Example: `${(os.loadavg()[0] / os.cpus().length * 100).toFixed(2)}%`
            memoryUsage: 'N/A', // Example: `${(usedMem / totalMem * 100).toFixed(2)}% (${(usedMem / 1024 / 1024).toFixed(0)}MB / ${(totalMem / 1024 / 1024).toFixed(0)}MB)`
        };
    }

    /**
     * Calculates and formats the system uptime.
     * @returns {string} Formatted uptime string.
     */
    getSystemUptime() {
        let uptimeSeconds = Math.floor((new Date() - this.systemStartTime) / 1000);
        const days = Math.floor(uptimeSeconds / (24 * 60 * 60));
        uptimeSeconds %= (24 * 60 * 60);
        const hours = Math.floor(uptimeSeconds / (60 * 60));
        uptimeSeconds %= (60 * 60);
        const minutes = Math.floor(uptimeSeconds / 60);
        const seconds = uptimeSeconds % 60;
        return `${days}d ${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * Starts periodic heartbeat monitoring for active sessions.
     * @param {number} interval - Interval in milliseconds for heartbeat checks.
     */
    startHeartbeatMonitoring(interval = 30000) { // Default to 30 seconds
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.logger.info('Cleared existing heartbeat interval.');
        }

        this.heartbeatIntervalId = setInterval(async () => { // Make callback async if needed
            this.logger.debug('Executing periodic heartbeat check...');
            if (!this.sessionManager) {
                this.logger.warn('SessionManager not available, skipping heartbeat check.');
                return;
            }

            const sessions = this.sessionManager.getAllSessions(); // Get all current SpotifySession objects
            if (!sessions || sessions.length === 0) {
                this.logger.debug('No active sessions to send heartbeats for.');
                return;
            }

            this.metrics.set('active_sessions_gauge', sessions.length); // Gauge for active sessions

            for (const session of sessions) {
                // Check if session is in a state that should receive heartbeats
                // Using 'status' from SpotifySession directly.
                const activeStates = ['running', 'idle', 'initializing', 'paused', 'restarting', 'unhealthy'];
                if (session && session.id && activeStates.includes(session.status)) {
                     // Construct heartbeat data from session properties
                    const heartbeatData = {
                        status: session.status,
                        createdAt: session.createdAt,
                        lastHeartbeat: session.lastHeartbeat,
                        // Add other relevant data from session object if available, e.g.:
                        // currentTrack: session.currentTrack || 'N/A',
                        // playTimeSeconds: session.stats?.totalPlaytime || 0,
                        errorsCount: session.stats?.errors?.length || 0,
                    };
                    this.recordSessionEvent(session.id, 'heartbeat_pulse', heartbeatData);

                    // Also, update the session's own lastHeartbeat via SessionManager's heartbeat method
                    // This ensures the HealthMonitor within SessionManager is also aware.
                    // Or, MonitoringSystem's HealthMonitor could be the primary one.
                    // For now, let's assume SessionManager's heartbeat updates the session object.
                    if (this.sessionManager.heartbeat) { // Check if method exists
                        this.sessionManager.heartbeat(session.id);
                    }
                }
            }
            this.logger.debug(`Heartbeat check completed for ${sessions.length} sessions.`);
        }, interval);

        this.logger.info(`Heartbeat monitoring started with interval: ${interval}ms`);
    }

    /**
     * Stops the periodic heartbeat monitoring.
     */
    stopHeartbeatMonitoring() {
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = null; // Clear the ID
            this.logger.info('Heartbeat monitoring stopped.');
        } else {
            this.logger.info('Heartbeat monitoring was not running.');
        }
    }
}

module.exports = MonitoringSystem;
