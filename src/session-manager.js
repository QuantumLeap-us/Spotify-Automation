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
            status: 'created',
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
    updateSessionStatus(sessionId, status, details = {}) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.status = status;
            session.lastUpdate = new Date();
            
            // Merge additional details
            Object.assign(session, details);
            
            this.activeSessions.set(sessionId, session);
            this.saveSessionData(sessionId, session);
            
            this.logger.info(`Session ${sessionId} status updated to: ${status}`);
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

    // Add error to session
    addSessionError(sessionId, error) {
        const session = this.activeSessions.get(sessionId);
        if (session && session.stats) {
            session.stats.errors.push({
                timestamp: new Date(),
                message: error.message || error,
                stack: error.stack || null
            });
            
            this.activeSessions.set(sessionId, session);
            this.saveSessionData(sessionId, session);
            
            this.logger.error(`Session ${sessionId} error:`, error);
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
    cleanupSession(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.endTime = new Date();
            session.duration = session.endTime - session.startTime;
            session.status = 'completed';
            
            this.saveSessionData(sessionId, session);
            this.activeSessions.delete(sessionId);
            
            this.logger.info(`Cleaned up session ${sessionId}`);
        }
    }

    // Get session statistics summary
    getSessionStatsSummary() {
        const sessions = this.getAllSessions();
        const summary = {
            totalSessions: sessions.length,
            activeSessions: sessions.filter(s => s.status === 'running').length,
            completedSessions: sessions.filter(s => s.status === 'completed').length,
            failedSessions: sessions.filter(s => s.status === 'failed').length,
            totalSuccessfulStreams: 0,
            totalFailedStreams: 0,
            totalPlaytime: 0
        };

        sessions.forEach(session => {
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
