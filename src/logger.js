const winston = require('winston');
const path = require('path');
const fs = require('fs');

class Logger {
    constructor(sessionId = 'main') {
        this.sessionId = sessionId;
        this.setupLogger();
    }

    setupLogger() {
        // Create logs directory if it doesn't exist
        const logsDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }

        // Custom format for logs
        const logFormat = winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.errors({ stack: true }),
            winston.format.printf(({ level, message, timestamp, stack }) => {
                const sessionPrefix = `[Session-${this.sessionId}]`;
                const logMessage = stack || message;
                return `${timestamp} ${sessionPrefix} [${level.toUpperCase()}]: ${logMessage}`;
            })
        );

        // Create logger instance
        this.logger = winston.createLogger({
            level: 'info',
            format: logFormat,
            transports: [
                // Console output
                new winston.transports.Console({
                    format: winston.format.combine(
                        winston.format.colorize(),
                        logFormat
                    )
                }),
                // File output for all logs
                new winston.transports.File({
                    filename: path.join(logsDir, 'application.log'),
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                }),
                // Separate file for errors
                new winston.transports.File({
                    filename: path.join(logsDir, 'errors.log'),
                    level: 'error',
                    maxsize: 10485760, // 10MB
                    maxFiles: 5
                }),
                // Session-specific log file
                new winston.transports.File({
                    filename: path.join(logsDir, `session-${this.sessionId}.log`),
                    maxsize: 5242880, // 5MB
                    maxFiles: 3
                })
            ]
        });
    }

    // Log methods
    info(message, meta = {}) {
        this.logger.info(message, meta);
    }

    error(message, error = null) {
        if (error) {
            this.logger.error(message, { error: error.message, stack: error.stack });
        } else {
            this.logger.error(message);
        }
    }

    warn(message, meta = {}) {
        this.logger.warn(message, meta);
    }

    debug(message, meta = {}) {
        this.logger.debug(message, meta);
    }

    // Log session statistics
    logSessionStats(stats) {
        this.info('Session Statistics:', {
            successful_streams: stats.successfulStreams || 0,
            failed_streams: stats.failedStreams || 0,
            total_playtime: stats.totalPlaytime || 0,
            proxy_used: stats.proxyUsed || 'none',
            account: stats.account || 'unknown'
        });
    }

    // Log login attempt
    logLoginAttempt(email, success, error = null) {
        if (success) {
            this.info(`Login successful for: ${email}`);
        } else {
            this.error(`Login failed for: ${email}`, error);
        }
    }

    // Log playback event
    logPlayback(trackUrl, action, duration = null) {
        const message = `Playback ${action}: ${trackUrl}`;
        const meta = duration ? { duration } : {};
        this.info(message, meta);
    }

    // Log proxy usage
    logProxyUsage(proxy, success) {
        const message = `Proxy ${proxy.host}:${proxy.port} - ${success ? 'Connected' : 'Failed'}`;
        if (success) {
            this.info(message);
        } else {
            this.error(message);
        }
    }

    // Log system events
    logSystemEvent(event, details = {}) {
        this.info(`System Event: ${event}`, details);
    }
}

module.exports = Logger;
