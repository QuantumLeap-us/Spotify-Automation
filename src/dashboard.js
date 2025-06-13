const express = require('express');
const Logger = require('./logger');
const path = require('path');

class Dashboard {
    constructor(sessionManager, configManager, proxyManager, monitoringSystem) { // Added monitoringSystem
        this.logger = new Logger('dashboard');
        this.sessionManager = sessionManager; // Will be updated by SpotifyAutomation after SessionManager is created
        this.configManager = configManager;
        this.proxyManager = proxyManager;
        this.monitoringSystem = monitoringSystem; // Store MonitoringSystem instance

        this.app = express();
        this.app.use(express.json());

        // Basic logging middleware for all requests
        this.app.use((req, res, next) => {
            this.logger.info(`Incoming request: ${req.method} ${req.path}`);
            next();
        });

        this.setupRoutes();
    }

    setupRoutes() {
        this.logger.info('Setting up API routes for dashboard.');

        // Health check endpoint for Docker
        this.app.get('/health', (req, res) => {
            // Basic health check: check if monitoring system and session manager are available
            // These components are critical for the app's main functions.
            const isMonitoringSystemReady = this.monitoringSystem && typeof this.monitoringSystem.generateHealthReport === 'function';
            const isSessionManagerReady = this.sessionManager && typeof this.sessionManager.getSessionStatsSummary === 'function';

            if (isMonitoringSystemReady && isSessionManagerReady) {
                this.logger.debug('Health check request: System UP');
                res.status(200).json({ status: 'UP', message: 'Application is healthy.' });
            } else {
                this.logger.error(`Health check request: System DOWN. MonitoringReady: ${isMonitoringSystemReady}, SessionManagerReady: ${isSessionManagerReady}`);
                res.status(503).json({
                    status: 'DOWN',
                    message: 'Core components not available.',
                    details: {
                        monitoringSystemReady: !!isMonitoringSystemReady,
                        sessionManagerReady: !!isSessionManagerReady,
                    }
                });
            }
        });

        // Route for overall system status - now uses MonitoringSystem
        this.app.get('/api/status', async (req, res) => { // Made async
            try {
                if (!this.monitoringSystem) {
                    this.logger.error('/api/status called but MonitoringSystem is not available.');
                    return res.status(503).json({ success: false, error: 'Monitoring system not available.' });
                }
                const report = await this.monitoringSystem.generateHealthReport();
                res.json({ success: true, data: report });
            } catch (error) {
                this.logger.error('Error generating health report for /api/status:', error);
                res.status(500).json({ success: false, error: 'Failed to retrieve system status.' });
            }
        });

        // Route for list of all sessions (active and persisted)
        this.app.get('/api/sessions', (req, res) => {
            if (!this.sessionManager) {
                 this.logger.error('/api/sessions called but SessionManager is not available.');
                 return res.status(503).json({ error: 'SessionManager not available.' });
            }
            try {
                // This logic was specific and might need adjustment if SessionManager.getAllSessions()
                // doesn't provide the combined view as previously assumed by this direct fs access.
                // The refactored SessionManager.getSessionStatsSummary() now provides a combined view.
                // For raw session list, SessionManager.getAllSessions() gets active SpotifySession objects.
                // To get all (including persisted), we might need a new method in SessionManager or use getSessionStatsSummary's source.

                // For now, using getAllSessions() for active ones, and noting that a more comprehensive list
                // is available in getSessionStatsSummary (which is part of /api/status).
                const activeSessionObjects = this.sessionManager.getAllSessions();
                // Convert SpotifySession objects to plain objects for JSON response if they have methods
                const plainSessionObjects = activeSessionObjects.map(s => (typeof s.toJSON === 'function' ? s.toJSON() : { ...s }));
                res.json(plainSessionObjects);

            } catch (error) {
                this.logger.error('Error fetching all sessions for /api/sessions:', error);
                res.status(500).json({ error: 'Failed to retrieve session list.' });
            }
        });

        // Route for detailed information of a specific session
        this.app.get('/api/sessions/:sessionId', (req, res) => {
            if (!this.sessionManager) {
                this.logger.error(`/api/sessions/:sessionId called but SessionManager is not available.`);
                return res.status(503).json({ error: 'SessionManager not available.' });
            }
            try {
                const sessionId = req.params.sessionId;
                let session = this.sessionManager.getSession(sessionId);
                if (!session) { // If not in active memory, try loading from persisted data
                    session = this.sessionManager.loadSessionData(sessionId);
                }

                if (session) {
                    const plainSession = (typeof session.toJSON === 'function' ? session.toJSON() : { ...session });
                    res.json(plainSession);
                } else {
                    res.status(404).json({ error: `Session ${sessionId} not found.` });
                }
            } catch (error) {
                this.logger.error(`Error fetching session ${req.params.sessionId} for /api/sessions/:sessionId:`, error);
                res.status(500).json({ error: 'Failed to retrieve session details.' });
            }
        });

        // Optional: Route for configuration (sensitive data should be filtered)
        this.app.get('/api/config', (req, res) => {
            try {
                if (!this.configManager) {
                    return res.status(503).json({ error: "ConfigManager not available." });
                }
                const fullConfig = this.configManager.getFullAutomationConfig();
                // Example: Filter out sensitive data like API keys, passwords
                const safeConfig = {
                    language: fullConfig.language,
                    browser: {
                        headless: fullConfig.browser.headless,
                        timeouts: full_config.browser.timeouts,
                    },
                    logging: fullConfig.logging,
                    session: fullConfig.session,
                    // DO NOT include fullConfig.captcha, fullConfig.proxy details with credentials, etc.
                };
                // If specific dashboard settings are in configManager:
                // const dashboardSettings = this.configManager.getDashboardSettings();
                // res.json({ automationConfig: safeConfig, dashboardSettings });
                res.json({ automationConfig: safeConfig });

            } catch (error) {
                this.logger.error('Error fetching config:', error);
                res.status(500).json({ error: 'Failed to retrieve configuration.' });
            }
        });

        // Placeholder for a simple HTML frontend
        this.app.get('/', (req, res) => {
            res.send(`
                <h1>Spotify Automation Dashboard</h1>
                <p>Welcome to the monitoring dashboard. Use the API endpoints to fetch data:</p>
                <ul>
                    <li><a href="/api/status">/api/status</a> - System health and session summary</li>
                    <li><a href="/api/sessions">/api/sessions</a> - All session details</li>
                </ul>
                <div id="status-data"></div>
                <script>
                    fetch('/api/status')
                        .then(response => response.json())
                        .then(data => {
                            document.getElementById('status-data').innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
                        })
                        .catch(err => {
                            document.getElementById('status-data').innerHTML = '<p>Error loading status: ' + err + '</p>';
                        });
                </script>
            `);
        });
    }

    start(port) {
        if (!port) {
            // Fallback to a default port if not provided, or get from config
            port = this.configManager?.getFullAutomationConfig()?.dashboard?.port || 3000;
            this.logger.info(`Dashboard port not explicitly provided, using default/config: ${port}`);
        }

        this.app.listen(port, () => {
            this.logger.info(`Dashboard server started on http://localhost:${port}`);
        }).on('error', (err) => {
            this.logger.error(`Failed to start dashboard server on port ${port}: ${err.message}`);
            if (err.code === 'EADDRINUSE') {
                this.logger.error(`Port ${port} is already in use. Try a different port.`);
                // Optionally, try another port or exit
            }
        });
    }
}

module.exports = Dashboard;
