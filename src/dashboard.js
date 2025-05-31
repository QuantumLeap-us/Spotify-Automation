const express = require('express');
const Logger = require('./logger');
const path = require('path'); // Needed for serving static files if we add a frontend

class Dashboard {
    constructor(sessionManager, configManager, proxyManager) { // Added proxyManager
        this.logger = new Logger('dashboard');
        this.sessionManager = sessionManager;
        this.configManager = configManager; // For accessing configuration to display (selectively)
        this.proxyManager = proxyManager;   // For accessing proxy stats

        this.app = express();
        this.app.use(express.json()); // Middleware to parse JSON bodies

        // Basic logging middleware for all requests
        this.app.use((req, res, next) => {
            this.logger.info(`Incoming request: ${req.method} ${req.path}`);
            next();
        });

        this.setupRoutes();
    }

    setupRoutes() {
        this.logger.info('Setting up API routes for dashboard.');

        // Route for overall system status and session summary
        this.app.get('/api/status', (req, res) => {
            try {
                const sessionStats = this.sessionManager.getSessionStatsSummary();
                const proxyStats = this.proxyManager ? this.proxyManager.getProxyStats() : { error: "ProxyManager not available" };
                // Add more system health information here if needed
                const systemHealth = {
                    status: "OK", // Basic status
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(), // System uptime in seconds
                    // Could add memory usage, CPU load, etc. using 'os' module if necessary
                };
                res.json({
                    systemHealth,
                    sessionStats,
                    proxyStats // Added proxy stats
                });
            } catch (error) {
                this.logger.error('Error fetching status:', error);
                res.status(500).json({ error: 'Failed to retrieve system status.' });
            }
        });

        // Route for list of all sessions (active and persisted)
        this.app.get('/api/sessions', (req, res) => {
            try {
                // getSessionStatsSummary reads all persisted sessions, which is more comprehensive
                // than just activeSessions for a historical view.
                // However, if only truly *active* (in-memory) sessions are desired:
                // const sessions = this.sessionManager.getAllSessions();
                // For now, let's use the more comprehensive list from getSessionStatsSummary's source:
                const sessionFiles = this.sessionManager.fs.readdirSync(this.sessionManager.sessionsDir)
                                     .filter(file => file.endsWith('.json') && !file.includes('_cookies'));
                const allTrackedSessions = sessionFiles.map(file => {
                    const sessionId = file.replace('.json', '');
                    return this.sessionManager.loadSessionData(sessionId);
                }).filter(s => s !== null);

                // Augment with in-memory active sessions to ensure most current data
                this.sessionManager.activeSessions.forEach((activeSession, sessionId) => {
                    const index = allTrackedSessions.findIndex(s => s.id === sessionId);
                    if (index !== -1) {
                        allTrackedSessions[index] = { ...allTrackedSessions[index], ...activeSession }; // Merge, active takes precedence
                    } else {
                        allTrackedSessions.push(activeSession);
                    }
                });

                res.json(allTrackedSessions);
            } catch (error) {
                this.logger.error('Error fetching all sessions:', error);
                res.status(500).json({ error: 'Failed to retrieve session list.' });
            }
        });

        // Route for detailed information of a specific session
        this.app.get('/api/sessions/:sessionId', (req, res) => {
            try {
                const sessionId = req.params.sessionId;
                let session = this.sessionManager.getSession(sessionId); // Check active first
                if (!session) {
                    session = this.sessionManager.loadSessionData(sessionId); // Then check persisted
                }

                if (session) {
                    res.json(session);
                } else {
                    res.status(404).json({ error: `Session ${sessionId} not found.` });
                }
            } catch (error) {
                this.logger.error(`Error fetching session ${req.params.sessionId}:`, error);
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
