const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

// Placeholder class definitions
class SpotifySession {
    constructor(options) {
        this.id = options.id || `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this.account = options.account; // Account information
        this.proxy = options.proxy;     // Proxy configuration
        this.behavior = options.behavior; // Behavior profile
        this.schedule = options.schedule; // Scheduled start/end times
        this.status = 'initializing';   // Initial status
        this.createdAt = new Date();
        this.lastHeartbeat = new Date();
        this.stats = {
            successfulStreams: 0,
            failedStreams: 0,
            totalPlaytime: 0,
            loginAttempts: 0,
            errors: []
        };
        // Add other session-specific properties or methods as needed
        this.startTime = options.startTime || this.createdAt; // Can be overridden by schedule
        this.lastUpdate = new Date();
    }

    // Placeholder: Determines if the session should be restarted (e.g., due to errors, age)
    shouldRestart() {
        // Example logic: restart if too many errors or session is too old
        // if (this.stats.errors.length > 5 || (Date.now() - this.createdAt > 24 * 60 * 60 * 1000)) {
        //     return true;
        // }
        return false;
    }

    // Placeholder: Basic health check for the session
    isHealthy() {
        // Example logic: check last heartbeat, error count
        // if (Date.now() - this.lastHeartbeat > 5 * 60 * 1000) { // No heartbeat for 5 mins
        //     return false;
        // }
        return this.status !== 'failed' && this.status !== 'unhealthy';
    }

    // Helper to update status
    updateStatus(newStatus) {
        this.status = newStatus;
        this.lastUpdate = new Date();
    }
}

class HealthMonitor {
    constructor() {
        this.logger = new Logger('health-monitor');
        // Placeholder: Could store historical health data or thresholds
    }
    recordHeartbeat(sessionId, session) { // session object passed for direct update
        this.logger.info(`Heartbeat for session ${sessionId}`);
        if (session) {
            session.lastHeartbeat = new Date();
        }
    }
    // Placeholder: Logic to handle an unhealthy session (e.g., flag for restart, notify)
    handleUnhealthySession(sessionId, session) { // session object passed
        this.logger.warn(`Handling unhealthy session ${sessionId}`);
        if (session) {
            session.updateStatus('unhealthy');
        }
        // Potentially trigger external notifications or more complex recovery logic
    }
}

class ShiftScheduler {
    constructor() {
        this.logger = new Logger('shift-scheduler');
        // Placeholder: Load schedule configurations, manage shift transitions
    }
    // Placeholder: Gets the next available time slot for a session
    getNextSlot() {
        this.logger.info('Getting next slot from scheduler (placeholder implementation)');
        const now = Date.now();
        return {
            startTime: new Date(now + 60000), // e.g., start in 1 minute
            endTime: new Date(now + 3600000 + 60000) // e.g., run for 1 hour
        };
    }
}


class SessionManager {
    // Updated constructor to accept behaviorEngine and use main shiftScheduler
    constructor(logger, configManager, shiftScheduler, behaviorEngine, proxyManager, monitoringSystem) {
        this.logger = logger || new Logger('session-manager');
        this.configManager = configManager;
        this.sessionsDir = path.join(__dirname, '../sessions');
        this.sessions = new Map();
        this.shiftScheduler = shiftScheduler; // Use the passed main ShiftScheduler instance
        this.behaviorEngine = behaviorEngine; // Store BehaviorEngine instance
        this.monitor = new HealthMonitor();   // SessionManager instantiates its own HealthMonitor
        this.proxyManager = proxyManager;
        this.monitoringSystem = monitoringSystem;
        this.maxConcurrent = 50;
        
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    // Generate unique session ID (can also be part of SpotifySession constructor)
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Selects a proxy using SmartproxyManager
    selectProxy(proxySettings, sessionId) { // Added sessionId
        this.logger.info(`Session ${sessionId} requesting proxy with settings:`, proxySettings);
        if (!this.proxyManager) {
            this.logger.error('ProxyManager not available in SessionManager. Cannot select proxy.');
            // Fallback to a very basic placeholder if no proxyManager, though this indicates a setup issue.
            return { host: 'fallback.proxy.example.com', port: 8080, type: 'http', error: 'ProxyManager_not_configured' };
        }
        const selectedProxy = this.proxyManager.selectProxyForSession(sessionId);
        if (!selectedProxy) {
            this.logger.error(`Session ${sessionId} could not obtain a proxy from ProxyManager.`);
            // Handle failure to get a proxy (e.g. throw error, or return a specific marker)
            return { error: 'No_proxy_available_from_ProxyManager' };
        }
        this.logger.info(`Session ${sessionId} assigned proxy: ${selectedProxy.id || selectedProxy.host}`);
        return selectedProxy;
    }

    // Removed internal placeholder generateBehaviorProfile. Will use this.behaviorEngine.

    // Create new session (Refactored to use injected BehaviorEngine and ShiftScheduler)
    async createSession(config = {}) {
        const sessionId = this.generateSessionId();

        const proxy = this.selectProxy(config.proxySettings, sessionId);
        if (proxy && proxy.error) {
            this.logger.error(`Failed to create session ${sessionId} due to proxy selection error: ${proxy.error}`);
            if (this.monitoringSystem) {
                this.monitoringSystem.recordSessionEvent(sessionId, 'proxy_error', {
                    message: `Proxy selection failed: ${proxy.error}`,
                    proxySettings: config.proxySettings
                });
            }
            return null;
        }

        // Use BehaviorEngine for profile and session length
        const behaviorProfile = this.behaviorEngine ? this.behaviorEngine.generateBehaviorProfile(config.behaviorSettings) : {type: 'default_fallback_behavior'};
        const sessionLengthConfig = this.behaviorEngine ? this.behaviorEngine.selectRandomSessionLength() : {tracks: [1,1], duration: [60,120]}; // Fallback

        // Use the main ShiftScheduler instance for scheduling info
        const schedule = this.shiftScheduler ? this.shiftScheduler.getNextSlot() : { startTime: new Date(), endTime: new Date(Date.now() + 3600000) };


        const sessionOptions = {
            id: sessionId,
            account: config.account,
            proxy,
            behavior,
            schedule,
            startTime: schedule.startTime // Session's actual start time might be dictated by scheduler
        };

        const session = new SpotifySession(sessionOptions);

        this.sessions.set(sessionId, session);
        this.saveSessionData(sessionId, session);
        
        this.logger.info(`Created session ${sessionId} for account ${config.account?.email || 'N/A'}`);
        if (this.monitoringSystem) {
            this.monitoringSystem.recordSessionEvent(sessionId, 'session_created', {
                accountId: config.account?.id || config.account?.email,
                proxyId: proxy?.id || proxy?.host
            });
        }
        return sessionId;
    }

    // Update session status (Adapted)
    updateSessionStatus(sessionId, status, reason = '', details = {}) {
        const session = this.sessions.get(sessionId);
        if (session) {
            const oldStatus = session.status;
            session.updateStatus(status);
            
            Object.assign(session, details);
            
            this.sessions.set(sessionId, session);
            this.saveSessionData(sessionId, session);
            
            if (this.monitoringSystem) {
                this.monitoringSystem.recordSessionEvent(sessionId, 'status_changed', { oldStatus, newStatus: status, reason });
            }

            let logMessage = `Session ${sessionId} status updated from ${oldStatus} to: ${status}`;
            if (reason) {
                logMessage += ` - Reason: ${reason}`;
            }
            this.logger.info(logMessage);
        }
    }

    // Update session statistics (Adapted)
    updateSessionStats(sessionId, statType, value = 1) {
        const session = this.sessions.get(sessionId);
        if (session && session.stats) { // SpotifySession now has stats property
            if (typeof session.stats[statType] === 'number') {
                session.stats[statType] += value;
            } else {
                session.stats[statType] = value; // Initialize if not number, e.g. errors array
            }
            
            // No need to this.sessions.set(sessionId, session) if session is a class instance (reference type)
            // and we are modifying its properties directly.
            this.saveSessionData(sessionId, session);
            
            this.logger.debug(`Session ${sessionId} stat ${statType} updated: ${session.stats[statType]}`);
        }
    }

    // Implement heartbeat method (Adapted to use HealthMonitor)
    heartbeat(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            this.monitor.recordHeartbeat(sessionId, session); // Pass session to monitor
            // Save session data if heartbeat updates a property like lastHeartbeat directly on session
            this.saveSessionData(sessionId, session);
        } else {
            this.logger.warn(`Heartbeat received for unknown or inactive session ${sessionId}`);
        }
    }

    // Add error to session (Adapted)
    addSessionError(sessionId, error, currentActivity = 'unknown activity', isCritical = false) {
        const session = this.sessions.get(sessionId);
        if (session) {
            const errorMessage = error.message || error.toString();
            const errorStack = error.stack || null;
            const errorEntry = {
                timestamp: new Date(),
                message: errorMessage,
                stack: errorStack,
                activity: currentActivity
            };
            session.stats.errors.push(errorEntry);

            this.logger.error(`Session ${sessionId} error during ${currentActivity}: ${errorMessage}`, errorStack);
            if (this.monitoringSystem) {
                this.monitoringSystem.recordSessionEvent(sessionId, 'error_recorded', {
                    message: errorMessage,
                    activity: currentActivity,
                    isCritical,
                    // stack: errorStack // Stack can be very long, consider if needed for event log
                });
            }

            if (isCritical) {
                this.logger.warn(`Critical error in session ${sessionId}, setting status to 'failed'.`);
                this.updateSessionStatus(sessionId, 'failed', `Critical error during ${currentActivity}: ${errorMessage}`);
            }
            
            this.saveSessionData(sessionId, session);
        } else {
            this.logger.error(`Failed to add error for unknown or inactive session ${sessionId}. Error: ${error.message || error.toString()}`);
        }
    }

    // Placeholder method for restarting a session
    async restartSession(sessionId) {
        this.logger.info(`Attempting to restart session ${sessionId}`);
        const oldSession = this.sessions.get(sessionId);
        if (oldSession) {
            const accountConfig = oldSession.account; // Assuming this holds original account config
            // Clean up the old session first
            this.cleanupSession(sessionId, 'restarting', 'Session is being restarted');

            // Create a new session with the same (or updated) configuration
            this.logger.info(`Creating new session instance for restart of ${sessionId}`);
            // We need the original config used for createSession, or reconstruct it
            // For simplicity, let's assume oldSession.account is enough to re-initiate
            await this.createSession({ account: accountConfig /*, proxySettings, behaviorSettings if available */});
            this.logger.info(`Session ${sessionId} marked for restart, new session created.`);
        } else {
            this.logger.warn(`Could not restart session ${sessionId}: Original session not found.`);
        }
    }

    // Placeholder method for handling an unhealthy session
    async handleUnhealthySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if(session) {
            this.monitor.handleUnhealthySession(sessionId, session); // Delegate to HealthMonitor
            this.saveSessionData(sessionId, session); // Save updated status
            // Further actions like attempting a restart or permanent shutdown could be decided here or by HealthMonitor
            if (session.status === 'unhealthy') { // Example: if monitor flagged it and it needs restart
                 // await this.restartSession(sessionId); // Option to restart
            }
        }
    }

    // New method for periodic lifecycle management
    async manageLifecycle() {
        this.logger.info('Running session lifecycle management...');
        if (this.sessions.size === 0) {
            this.logger.info('No active sessions to manage.');
            return;
        }

        for (const [id, session] of this.sessions) {
            if (!session || typeof session.isHealthy !== 'function' || typeof session.shouldRestart !== 'function') {
                this.logger.warn(`Session ${id} is not a valid SpotifySession object or is malformed. Skipping.`);
                continue;
            }

            if (session.shouldRestart()) {
                this.logger.info(`Session ${id} flagged for restart.`);
                await this.restartSession(id); // Restart logic might remove/re-add, careful with iterator
                continue; // If restarted, the original session instance might be gone or replaced
            }

            if (session.isHealthy()) {
                // this.monitor.recordHeartbeat(id, session); // Heartbeat might be better driven externally or by session activity
                // For now, let's assume heartbeats are recorded, and this check is more for action
                this.logger.debug(`Session ${id} is healthy. Current status: ${session.status}`);
            } else {
                this.logger.warn(`Session ${id} is unhealthy. Current status: ${session.status}`);
                await this.handleUnhealthySession(id);
            }

            // Placeholder: Check if session duration exceeded schedule
            const now = new Date();
            if (session.schedule && session.schedule.endTime && now > new Date(session.schedule.endTime)) {
                this.logger.info(`Session ${id} has passed its scheduled end time. Cleaning up.`);
                this.cleanupSession(id, 'completed', 'Scheduled end time reached');
            }
        }
        this.logger.info('Finished session lifecycle management round.');
    }


    // Get session data (Adapted)
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }

    // Get all sessions (Adapted)
    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    // Save session data to file (SpotifySession should be serializable)
    saveSessionData(sessionId, sessionData) {
        try {
            const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
            // Ensure we are saving a plain object if SpotifySession has methods
            // A common way is to have a toJSON() method on the class, or spread its properties.
            const dataToSave = (typeof sessionData.toJSON === 'function') ? sessionData.toJSON() : { ...sessionData };
            fs.writeFileSync(sessionFile, JSON.stringify(dataToSave, null, 2));
        } catch (error) {
            this.logger.error(`Failed to save session data for ${sessionId}:`, error);
        }
    }

    // Load session data from file (Adapted to potentially re-hydrate SpotifySession instances)
    loadSessionData(sessionId) {
        try {
            const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
            if (fs.existsSync(sessionFile)) {
                const data = fs.readFileSync(sessionFile, 'utf8');
                const jsonData = JSON.parse(data);
                // Optionally, re-hydrate into a SpotifySession instance
                // For now, just return the plain object. If methods are needed on loaded sessions:
                // return new SpotifySession(jsonData);
                return jsonData;
            }
        } catch (error) {
            this.logger.error(`Failed to load session data for ${sessionId}:`, error);
        }
        return null;
    }

    // Save cookies for session (No change needed in logic, path might be different if session object stores it)
    async saveCookies(sessionId, cookies) {
        try {
            const cookiesFile = path.join(this.sessionsDir, `${sessionId}_cookies.json`);
            fs.writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
            this.logger.info(`Saved cookies for session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to save cookies for session ${sessionId}:`, error);
        }
    }

    // Load cookies for session (No change needed in logic)
    async loadCookies(sessionId) {
        try {
            const cookiesFile = path.join(this.sessionsDir, `${sessionId}_cookies.json`);
            if (fs.existsSync(cookiesFile)) {
                const data = fs.readFileSync(cookiesFile, 'utf8');
                const cookies = JSON.parse(data);
                this.logger.info(`Loaded cookies for session ${sessionId}`);
                return cookies;
            }
        } catch (error) {
            this.logger.error(`Failed to load cookies for session ${sessionId}:`, error);
        }
        return null;
    }

    // Clean up session (Adapted)
    cleanupSession(sessionId, finalStatus = 'completed', reason = 'Session ended normally') {
        const session = this.sessions.get(sessionId); // Use this.sessions
        if (session) {
            this.logger.info(`Starting cleanup for session ${sessionId}. Current status: ${session.status}, Final status to be: ${finalStatus}. Reason: ${reason}`);

            session.endTime = new Date(); // Assuming SpotifySession objects get an endTime property
            if (session.startTime) {
                // Ensure startTime is a Date object if loading from JSON
                const startTimeDate = (session.startTime instanceof Date) ? session.startTime : new Date(session.startTime);
                session.duration = session.endTime - startTimeDate;
            } else {
                session.duration = 0;
                this.logger.warn(`Session ${sessionId} missing startTime for duration calculation.`);
            }
            
            this.logger.info(`Placeholder: Perform actual resource cleanup for session ${sessionId} here (e.g., close browser, delete temp files).`);

            this.updateSessionStatus(sessionId, finalStatus, reason); // This will also save the session
            
            // Remove from active sessions map
            const deleted = this.sessions.delete(sessionId); // Use this.sessions
            if(deleted) {
                this.logger.info(`Session ${sessionId} removed from map.`);
            } else {
                this.logger.warn(`Attempted to delete session ${sessionId} from map, but it was not found.`);
            }

            this.logger.info(`Finished cleanup for session ${sessionId}. Final status: ${finalStatus}.`);
        } else {
            this.logger.warn(`Cleanup called for unknown or already cleaned up session ${sessionId}.`);
        }
    }

    // Get session statistics summary (Adapted)
    getSessionStatsSummary() {
        const sessionFiles = fs.readdirSync(this.sessionsDir).filter(file => file.endsWith('.json') && !file.includes('_cookies'));
        let allPersistedSessions = [];

        sessionFiles.forEach(file => {
            const loadedSessionData = this.loadSessionData(file.replace('.json', ''));
            if (loadedSessionData) {
                // Ensure it has a status, default to 'unknown' if malformed after loading
                if (!loadedSessionData.status) loadedSessionData.status = 'unknown_persisted_state';
                allPersistedSessions.push(loadedSessionData);
            }
        });

        // Combine in-memory sessions with persisted ones, giving preference to in-memory versions for current state.
        const combinedSessions = [...allPersistedSessions];
        this.sessions.forEach((activeSession, sessionId) => {
            const index = combinedSessions.findIndex(s => s.id === sessionId);
            const sessionToStore = (typeof activeSession.toJSON === 'function') ? activeSession.toJSON() : { ...activeSession };
            if (index !== -1) {
                combinedSessions[index] = sessionToStore; // Update with active version
            } else {
                combinedSessions.push(sessionToStore); // Add active session if not found in persisted (e.g. new)
            }
        });

        const summary = {
            totalTrackedSessions: combinedSessions.length,
            initializingSessions: combinedSessions.filter(s => s.status === 'initializing').length,
            runningSessions: combinedSessions.filter(s => s.status === 'running').length,
            idleSessions: combinedSessions.filter(s => s.status === 'idle').length,
            pausedSessions: combinedSessions.filter(s => s.status === 'paused').length,
            stoppedSessions: combinedSessions.filter(s => s.status === 'stopped').length,
            failedSessions: combinedSessions.filter(s => s.status === 'failed').length,
            completedSessions: combinedSessions.filter(s => s.status === 'completed').length,
            restartingSessions: combinedSessions.filter(s => s.status === 'restarting').length, // New state
            unhealthySessions: combinedSessions.filter(s => s.status === 'unhealthy').length, // New state
            unknownSessions: combinedSessions.filter(s => s.status === 'unknown_persisted_state').length,
            operationallyActiveSessions: 0,
            totalSuccessfulStreams: 0,
            totalFailedStreams: 0,
            totalPlaytime: 0
        };

        summary.operationallyActiveSessions = summary.runningSessions +
                                              summary.initializingSessions +
                                              summary.idleSessions +
                                              summary.pausedSessions +
                                              summary.restartingSessions; // Restarting sessions are also active

        combinedSessions.forEach(session => {
            if (session.stats) { // Ensure stats object exists
                summary.totalSuccessfulStreams += session.stats.successfulStreams || 0;
                summary.totalFailedStreams += session.stats.failedStreams || 0;
                summary.totalPlaytime += session.stats.totalPlaytime || 0;
            }
        });

        return summary;
    }

    // Clean old session files (No change in logic needed, but uses this.sessionsDir)
    cleanOldSessions(maxAge = 7 * 24 * 60 * 60 * 1000) { // 7 days default
        try {
            const files = fs.readdirSync(this.sessionsDir);
            const now = Date.now();
            
            files.forEach(file => {
                const filePath = path.join(this.sessionsDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath);
                    this.logger.info(`Cleaned old session file: ${file}`);
                }
            });
        } catch (error) {
            this.logger.error('Failed to clean old sessions:', error);
        }
    }
}

module.exports = SessionManager;
