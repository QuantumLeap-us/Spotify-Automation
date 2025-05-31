const fs = require('fs');
const path = require('path');
const Logger = require('./logger');

class SessionManager {
    constructor() {
        this.logger = new Logger('session-manager');
        this.sessionsDir = path.join(__dirname, '../sessions');
        this.activeSessions = new Map();
        this.sessionStats = new Map();
        
        // Create sessions directory if it doesn't exist
        if (!fs.existsSync(this.sessionsDir)) {
            fs.mkdirSync(this.sessionsDir, { recursive: true });
        }
    }

    // Generate unique session ID
    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // Create new session
    createSession(account, proxy = null) {
        const sessionId = this.generateSessionId();
        const sessionData = {
            id: sessionId,
            account: account,
            proxy: proxy,
            startTime: new Date(),
            status: 'initializing', // Changed from 'created' to 'initializing'
            stats: {
                successfulStreams: 0,
                failedStreams: 0,
                totalPlaytime: 0,
                loginAttempts: 0,
                errors: []
            }
        };

        this.activeSessions.set(sessionId, sessionData);
        this.saveSessionData(sessionId, sessionData);
        
        this.logger.info(`Created session ${sessionId} for account ${account.email}`);
        return sessionId;
    }

    // Update session status
    updateSessionStatus(sessionId, status, reason = '', details = {}) { // Added reason parameter
        const session = this.activeSessions.get(sessionId);
        if (session) {
            const oldStatus = session.status;
            session.status = status;
            session.lastUpdate = new Date();
            
            // Merge additional details
            Object.assign(session, details);
            
            this.activeSessions.set(sessionId, session);
            this.saveSessionData(sessionId, session);
            
            let logMessage = `Session ${sessionId} status updated from ${oldStatus} to: ${status}`;
            if (reason) {
                logMessage += ` - Reason: ${reason}`;
            }
            this.logger.info(logMessage);
        }
    }

    // Update session statistics
    updateSessionStats(sessionId, statType, value = 1) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.stats) {
            if (typeof session.stats[statType] === 'number') {
                session.stats[statType] += value;
            } else {
                session.stats[statType] = value;
            }
            
            this.activeSessions.set(sessionId, session);
            this.saveSessionData(sessionId, session);
            
            this.logger.debug(`Session ${sessionId} stat ${statType} updated: ${session.stats[statType]}`);
        }
    }

    // Implement heartbeat method
    heartbeat(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.lastHeartbeat = new Date();
            this.activeSessions.set(sessionId, session);
            // We might not need to save session data on every heartbeat for performance reasons.
            // Depending on how critical this is, consider saving periodically or during other state changes.
            // For now, let's save it to ensure data persistence.
            this.saveSessionData(sessionId, session);
            this.logger.debug(`Heartbeat received for session ${sessionId}`);
        } else {
            this.logger.warn(`Heartbeat received for unknown or inactive session ${sessionId}`);
        }
    }

    // Add error to session
    addSessionError(sessionId, error, currentActivity = 'unknown activity', isCritical = false) { // Added currentActivity and isCritical
        const session = this.activeSessions.get(sessionId);
        if (session) { // Modified to check session directly, not session.stats
            if (!session.stats) { // Initialize stats if not present
                session.stats = { errors: [] };
            }
            if (!session.stats.errors) { // Initialize errors array if not present
                session.stats.errors = [];
            }

            const errorEntry = {
                timestamp: new Date(),
                message: error.message || error.toString(), // Ensure error is stringified
                stack: error.stack || null,
                activity: currentActivity
            };
            session.stats.errors.push(errorEntry);
            
            this.logger.error(`Session ${sessionId} error during ${currentActivity}: ${error.message || error.toString()}`, error.stack);

            if (isCritical) {
                this.logger.warn(`Critical error in session ${sessionId}, setting status to 'failed'.`);
                this.updateSessionStatus(sessionId, 'failed', `Critical error during ${currentActivity}: ${error.message || error.toString()}`);
            }
            
            this.activeSessions.set(sessionId, session); // Ensure session is updated in the map
            this.saveSessionData(sessionId, session);
        } else {
            this.logger.error(`Failed to add error for unknown or inactive session ${sessionId}. Error: ${error.message || error.toString()}`);
        }
    }

    // Get session data
    getSession(sessionId) {
        return this.activeSessions.get(sessionId);
    }

    // Get all active sessions
    getAllSessions() {
        return Array.from(this.activeSessions.values());
    }

    // Save session data to file
    saveSessionData(sessionId, sessionData) {
        try {
            const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
            fs.writeFileSync(sessionFile, JSON.stringify(sessionData, null, 2));
        } catch (error) {
            this.logger.error(`Failed to save session data for ${sessionId}:`, error);
        }
    }

    // Load session data from file
    loadSessionData(sessionId) {
        try {
            const sessionFile = path.join(this.sessionsDir, `${sessionId}.json`);
            if (fs.existsSync(sessionFile)) {
                const data = fs.readFileSync(sessionFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            this.logger.error(`Failed to load session data for ${sessionId}:`, error);
        }
        return null;
    }

    // Save cookies for session
    async saveCookies(sessionId, cookies) {
        try {
            const cookiesFile = path.join(this.sessionsDir, `${sessionId}_cookies.json`);
            fs.writeFileSync(cookiesFile, JSON.stringify(cookies, null, 2));
            this.logger.info(`Saved cookies for session ${sessionId}`);
        } catch (error) {
            this.logger.error(`Failed to save cookies for session ${sessionId}:`, error);
        }
    }

    // Load cookies for session
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

    // Clean up completed session
    cleanupSession(sessionId, finalStatus = 'completed', reason = 'Session ended normally') { // Added finalStatus and reason
        const session = this.activeSessions.get(sessionId);
        if (session) {
            this.logger.info(`Starting cleanup for session ${sessionId}. Current status: ${session.status}, Final status to be: ${finalStatus}. Reason: ${reason}`);

            session.endTime = new Date();
            if (session.startTime) { // Ensure startTime exists before calculating duration
                session.duration = session.endTime - new Date(session.startTime); // Ensure startTime is a Date object
            } else {
                session.duration = 0; // Or handle as an error/unknown duration
                this.logger.warn(`Session ${sessionId} missing startTime for duration calculation.`);
            }
            
            // Placeholder for actual resource cleanup (e.g., browser contexts, files)
            this.logger.info(`Placeholder: Perform actual resource cleanup for session ${sessionId} here (e.g., close browser, delete temp files).`);
            // Example: if (session.browserContext) { await session.browserContext.close(); }

            this.updateSessionStatus(sessionId, finalStatus, reason);

            // Persist final session state before removing from active sessions
            this.saveSessionData(sessionId, session);
            
            // Remove from active sessions map
            const deleted = this.activeSessions.delete(sessionId);
            if(deleted) {
                this.logger.info(`Session ${sessionId} removed from active sessions.`);
            } else {
                this.logger.warn(`Attempted to delete session ${sessionId} from active sessions, but it was not found. It might have been already cleaned up.`);
            }

            this.logger.info(`Finished cleanup for session ${sessionId}. Final status: ${finalStatus}.`);
        } else {
            this.logger.warn(`Cleanup called for unknown or already cleaned up session ${sessionId}.`);
        }
    }

    // Get session statistics summary
    getSessionStatsSummary() {
        // It's better to get all session data from files for a complete summary,
        // including those not currently in activeSessions (e.g. completed, failed and then cleaned up).
        // However, for simplicity and consistency with current getAllSessions, we'll use activeSessions plus persisted ones.
        // This part might need a more robust solution for tracking all historical states if needed.

        const sessionFiles = fs.readdirSync(this.sessionsDir).filter(file => file.endsWith('.json') && !file.includes('_cookies'));
        const allTrackedSessions = [];

        sessionFiles.forEach(file => {
            const sessionId = file.replace('.json', '');
            const loadedSession = this.loadSessionData(sessionId);
            if (loadedSession) {
                allTrackedSessions.push(loadedSession);
            }
        });

        // Ensure active sessions reflect the most current state if they haven't been persisted yet by cleanup/error handling
        this.activeSessions.forEach((activeSession, sessionId) => {
            const index = allTrackedSessions.findIndex(s => s.id === sessionId);
            if (index !== -1) {
                allTrackedSessions[index] = activeSession; // Update with in-memory version
            } else {
                allTrackedSessions.push(activeSession); // Add if not found (should not happen if saveSessionData is consistent)
            }
        });


        const summary = {
            totalTrackedSessions: allTrackedSessions.length,
            initializingSessions: allTrackedSessions.filter(s => s.status === 'initializing').length,
            runningSessions: allTrackedSessions.filter(s => s.status === 'running').length,
            idleSessions: allTrackedSessions.filter(s => s.status === 'idle').length,
            pausedSessions: allTrackedSessions.filter(s => s.status === 'paused').length,
            stoppedSessions: allTrackedSessions.filter(s => s.status === 'stopped').length,
            failedSessions: allTrackedSessions.filter(s => s.status === 'failed').length,
            completedSessions: allTrackedSessions.filter(s => s.status === 'completed').length,
            // Active sessions here could mean 'not in a final state' (completed, failed, stopped)
            // For this summary, we'll count 'running' + 'initializing' + 'idle' + 'paused' as active operationally.
            operationallyActiveSessions: 0,
            totalSuccessfulStreams: 0,
            totalFailedStreams: 0,
            totalPlaytime: 0
        };

        summary.operationallyActiveSessions = summary.runningSessions + summary.initializingSessions + summary.idleSessions + summary.pausedSessions;

        allTrackedSessions.forEach(session => {
            if (session.stats) {
                summary.totalSuccessfulStreams += session.stats.successfulStreams || 0;
                summary.totalFailedStreams += session.stats.failedStreams || 0;
                summary.totalPlaytime += session.stats.totalPlaytime || 0;
            }
        });

        return summary;
    }

    // Clean old session files
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
