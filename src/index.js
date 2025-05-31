const { chromium } = require('playwright');
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const SessionManager = require('./session-manager');
const ProxyManager = require('./proxy-manager');
const StealthConfig = require('./stealth-config');
const CaptchaSolver = require('./captcha-solver');
const ConfigManager = require('./config-manager');
const BehaviorEngine = require('./behavior-engine');
const Scheduler = require('./scheduler');
const Dashboard = require('./dashboard'); // Added Dashboard

class SpotifyAutomation {
    constructor() {
        this.logger = new Logger('spotify-automation');
        this.configManager = new ConfigManager();
        this.accountsConfig = this.loadAccountsConfig();

        this.sessionManager = new SessionManager();
        this.proxyManager = new ProxyManager(); // Initialized ProxyManager
        this.stealthConfig = new StealthConfig();
        this.captchaSolver = new CaptchaSolver(process.env.CAPTCHA_API_KEY || this.configManager.getCaptchaSettings().apiKey);
        this.behaviorEngine = new BehaviorEngine();
        this.scheduler = new Scheduler(this, this.sessionManager, this.configManager);
        this.dashboard = new Dashboard(this.sessionManager, this.configManager, this.proxyManager); // Instantiated Dashboard

        this.sessions = new Map();

        this.logger.info('SpotifyAutomation initialized with all components, including Dashboard.');
    }

    // Load accounts configuration from YAML file
    loadAccountsConfig() {
        try {
            const configPath = path.join(__dirname, '../config/accounts.yaml');
            if (!fs.existsSync(configPath)) {
                this.logger.error('accounts.yaml not found! Cannot start sessions.');
                process.exit(1); // Critical error
            }
            const configFile = fs.readFileSync(configPath, 'utf8');
            const parsedConfig = YAML.parse(configFile);
            if (!parsedConfig || !parsedConfig.accounts || parsedConfig.accounts.length === 0) {
                this.logger.error('No accounts found in accounts.yaml or file is empty. Cannot start sessions.');
                process.exit(1); // Critical error
            }
            // Make the accounts config available at this.config as other parts of the class might expect it there.
            // This also ensures that the 'config' property used by Scheduler for totalCapacity is the accounts config.
            this.config = parsedConfig;
            return parsedConfig;
        } catch (error) {
            this.logger.error('Failed to load accounts.yaml:', error);
            process.exit(1);
        }
    }

    // Initialize browser with stealth configuration
    async createBrowser(proxy = null) {
        const browserOptions = {
            headless: false, // Use non-headless mode for better stealth
            args: [
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-features=VizDisplayCompositor',
                '--disable-web-security',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection'
            ]
        };

        // Add proxy configuration if provided
        if (proxy) {
            browserOptions.proxy = {
                server: `${proxy.type}://${proxy.host}:${proxy.port}`,
                username: proxy.username,
                password: proxy.password
            };
        }

        const browser = await chromium.launch(browserOptions);
        return browser;
    }

    // Create new browser context with geo-matched stealth settings
    async createContext(browser, proxy = null) {
        const preferEnglish = this.configManager.shouldPreferEnglish();
        const stealthSettings = this.stealthConfig.getGeoMatchedSettings(proxy, { preferEnglish });

        this.logger.info(`Creating context for location: ${stealthSettings.location}`);
        this.logger.info(`Using timezone: ${stealthSettings.timezone}, language: ${stealthSettings.language}`);

        const context = await browser.newContext({
            userAgent: stealthSettings.userAgent,
            viewport: stealthSettings.viewport,
            locale: stealthSettings.language,
            timezoneId: stealthSettings.timezone,
            permissions: ['notifications'],
            extraHTTPHeaders: {
                'Accept-Language': stealthSettings.acceptLanguage,
                'Accept-Encoding': stealthSettings.acceptEncoding,
                'Connection': stealthSettings.connection,
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1'
            }
        });

        // Apply geo-specific stealth measures
        await context.addInitScript((settings) => {
            // Remove webdriver property
            delete navigator.__proto__.webdriver;

            // Override plugins with realistic values
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format"},
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    },
                    {
                        0: {type: "application/x-nacl", suffixes: "nexe", description: "Native Client Executable"},
                        description: "Native Client",
                        filename: "internal-nacl-plugin",
                        length: 1,
                        name: "Native Client"
                    }
                ]
            });

            // Override languages based on geo location
            Object.defineProperty(navigator, 'languages', {
                get: () => settings.acceptLanguage.split(',').map(lang => lang.split(';')[0].trim())
            });

            // Override hardware concurrency
            Object.defineProperty(navigator, 'hardwareConcurrency', {
                get: () => settings.hardwareConcurrency
            });

            // Override device memory
            if ('deviceMemory' in navigator) {
                Object.defineProperty(navigator, 'deviceMemory', {
                    get: () => settings.deviceMemory
                });
            }

            // Override platform
            Object.defineProperty(navigator, 'platform', {
                get: () => settings.platform
            });

            // Override WebGL parameters
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return settings.webgl.vendor;
                }
                if (parameter === 37446) {
                    return settings.webgl.renderer;
                }
                return getParameter.call(this, parameter);
            };

            // Override WebGL2 parameters
            if (typeof WebGL2RenderingContext !== 'undefined') {
                const getParameter2 = WebGL2RenderingContext.prototype.getParameter;
                WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                    if (parameter === 37445) {
                        return settings.webgl.vendor;
                    }
                    if (parameter === 37446) {
                        return settings.webgl.renderer;
                    }
                    return getParameter2.call(this, parameter);
                };
            }

            // Override screen properties
            Object.defineProperty(screen, 'colorDepth', {
                get: () => settings.colorDepth
            });

            Object.defineProperty(screen, 'pixelDepth', {
                get: () => settings.pixelDepth
            });

        }, stealthSettings);

        return context;
    }

    // Login to Spotify (following original Java program logic)
    async login(page, account) {
        try {
            this.logger.info(`Logging in with account: ${account.email}`);

            // Step 1: Go to Spotify main page (like original program)
            await page.goto('https://open.spotify.com');
            await page.waitForTimeout(2000);

            // Step 2: Click login button (like original program)
            this.logger.info('Clicking login button...');
            await page.click('[data-testid="login-button"]');
            await page.waitForTimeout(1000);

            // Step 3: Try original program's selectors first
            this.logger.info('Attempting login with original selectors...');
            try {
                // Use original Java program selectors: #GlueTextInput-1 and #GlueTextInput-2
                await page.waitForSelector('#GlueTextInput-1', { timeout: 10000 });
                await page.fill('#GlueTextInput-1', account.email);
                this.logger.info('Email filled successfully (GlueTextInput-1)');

                await page.waitForSelector('#GlueTextInput-2', { timeout: 5000 });
                await page.fill('#GlueTextInput-2', account.password);
                this.logger.info('Password filled successfully (GlueTextInput-2)');

                // Click login button
                await page.click('#login-button');
                await page.waitForTimeout(1000);

            } catch (originalError) {
                this.logger.warn('Original selectors failed, trying modern step-by-step login...');

                try {
                    // Modern Spotify login: step-by-step process
                    this.logger.info('Attempting step-by-step login process...');

                    // Step 1: Fill username
                    await page.waitForSelector('#login-username', { timeout: 5000 });
                    await page.fill('#login-username', account.email);
                    this.logger.info('Email filled successfully (login-username)');

                    // Step 2: Press Enter to proceed to next step
                    await page.press('#login-username', 'Enter');
                    this.logger.info('Pressed Enter to proceed to next step');
                    await page.waitForTimeout(3000);

                    // Step 2.5: Check if we need to click "Use password login" button
                    try {
                        // Use precise selectors based on actual button structure
                        const passwordLoginSelectors = [
                            'button[data-encore-id="buttonTertiary"]:has-text("Use password")',
                            'button.Button-sc-1dqy6lx-0:has-text("Use password")',
                            'button:has-text("Use password")',
                            'button[data-encore-id="buttonTertiary"]',
                            'button:has-text("Continue with password")',
                            'button:has-text("Log in with password")'
                        ];

                        let buttonFound = false;
                        for (const selector of passwordLoginSelectors) {
                            try {
                                const passwordLoginButton = page.locator(selector);
                                if (await passwordLoginButton.isVisible()) {
                                    await passwordLoginButton.click();
                                    this.logger.info(`Clicked password login button (selector: ${selector})`);
                                    await page.waitForTimeout(2000);
                                    buttonFound = true;
                                    break;
                                }
                            } catch (selectorError) {
                                continue;
                            }
                        }

                        if (!buttonFound) {
                            this.logger.info('No password login button found, proceeding...');
                        }

                    } catch (passwordButtonError) {
                        this.logger.warn('Error finding password login button, proceeding...');
                    }

                    // Step 3: Wait for and fill password
                    await page.waitForSelector('#login-password', { timeout: 8000 });
                    await page.fill('#login-password', account.password);
                    this.logger.info('Password filled successfully (login-password)');

                    // Step 4: Click login button
                    await page.click('#login-button');
                    await page.waitForTimeout(1000);

                } catch (fallbackError) {
                    this.logger.error('Step-by-step login also failed');
                    this.logger.error('Current URL:', page.url());
                    throw new Error('Could not complete login process');
                }
            }

            // Step 4: Wait for login result and handle captcha if needed
            this.logger.info('Waiting for login result...');
            await page.waitForTimeout(3000);

            // Check and handle captcha
            this.logger.info('Checking for captcha...');
            const captchaHandled = await this.captchaSolver.handleCaptcha(page);

            if (captchaHandled) {
                this.logger.info('Captcha handled, waiting for final result...');
                await page.waitForTimeout(5000);
            }

            // Check multiple indicators of successful login
            const loginChecks = [
                () => page.locator('[data-testid="user-widget-link"]').isVisible(),
                () => page.locator('[data-testid="user-widget"]').isVisible(),
                () => page.url().includes('open.spotify.com') && !page.url().includes('login') && !page.url().includes('challenge'),
                () => page.locator('button[data-testid="play-button"]').isVisible()
            ];

            let isLoggedIn = false;
            for (const check of loginChecks) {
                try {
                    if (await check()) {
                        isLoggedIn = true;
                        break;
                    }
                } catch (error) {
                    // Continue to next check
                }
            }

            if (isLoggedIn) {
                this.logger.info(`Successfully logged in: ${account.email}`);
                return true;
            } else {
                this.logger.error(`Login failed for: ${account.email}`);
                this.logger.info(`Current URL: ${page.url()}`);
                return false;
            }
        } catch (error) {
            this.logger.error(`Login error for ${account.email}:`, error);
            return false;
        }
    }

    // Search and play song
    async playTrack(page, trackUrl) {
        try {
            this.logger.info(`Playing track: ${trackUrl}`);

            // Navigate directly to track URL
            await page.goto(trackUrl);
            await page.waitForTimeout(3000);

            // Click play button
            const playButton = page.locator('[data-testid="play-button"]').first();
            await playButton.click();
            await page.waitForTimeout(2000);

            this.logger.info('Track started playing');
            return true;
        } catch (error) {
            this.logger.error('Error playing track:', error);
            return false;
        }
    }

    // Simulate human-like listening behavior
    async simulateListening(page, duration) {
        const startTime = Date.now();
        const endTime = startTime + (duration * 1000);

        while (Date.now() < endTime) {
            // Random actions to simulate human behavior
            const actions = ['scroll', 'hover', 'wait'];
            const randomAction = actions[Math.floor(Math.random() * actions.length)];

            switch (randomAction) {
                case 'scroll':
                    await page.mouse.wheel(0, Math.random() * 100);
                    break;
                case 'hover':
                    const x = Math.random() * 800 + 100;
                    const y = Math.random() * 600 + 100;
                    await page.mouse.move(x, y);
                    break;
                case 'wait':
                    await page.waitForTimeout(Math.random() * 5000 + 2000);
                    break;
            }

            await page.waitForTimeout(Math.random() * 3000 + 1000);
        }
    }

    // Run single session with enhanced geo-matching and original system features
    async runSession(sessionId, account, proxy = null) {
        let browser = null;
        let context = null;
        let sessionData = null;

        try {
            this.logger.info(`Starting session ${sessionId} for ${account.email}`);

            // Create session tracking (similar to original Values class)
            sessionData = this.sessionManager.createSession(account, proxy);
            this.sessionManager.updateSessionStatus(sessionData, 'starting');

            // Log proxy usage if available
            if (proxy) {
                this.logger.info(`Using proxy: ${proxy.host}:${proxy.port} (${proxy.type})`);
                this.proxyManager.markProxyUsed(proxy, true); // Mark as starting
            }

            browser = await this.createBrowser(proxy);
            context = await this.createContext(browser, proxy); // Pass proxy for geo-matching
            const page = await context.newPage();

            // Update session status
            this.sessionManager.updateSessionStatus(sessionData, 'running');

            // Login with retry mechanism (similar to original system)
            let loginSuccess = false;
            let loginAttempts = 0;
            const maxLoginAttempts = 3;

            while (!loginSuccess && loginAttempts < maxLoginAttempts) {
                try {
                    loginAttempts++;
                    this.sessionManager.updateSessionStats(sessionData, 'loginAttempts', 1);

                    loginSuccess = await this.login(page, account);
                    if (loginSuccess) {
                        this.logger.info(`Login successful for ${account.email} (attempt ${loginAttempts})`);
                        break;
                    }
                } catch (loginError) {
                    this.logger.warn(`Login attempt ${loginAttempts} failed for ${account.email}:`, loginError);
                    if (loginAttempts < maxLoginAttempts) {
                        await page.waitForTimeout(5000); // Wait before retry
                    }
                }
            }

            if (!loginSuccess) {
                throw new Error(`Login failed after ${maxLoginAttempts} attempts`);
            }

            // Play tracks with repeat mechanism (similar to original playSong method)
            for (const trackUrl of this.config.playback.songs) {
                try {
                    const playSuccess = await this.playTrack(page, trackUrl);
                    if (playSuccess) {
                        // Random repeat count (similar to original repeat logic)
                        const repeatCount = Math.floor(Math.random() *
                            (this.config.playback.repeat_count[1] - this.config.playback.repeat_count[0] + 1)) +
                            this.config.playback.repeat_count[0];

                        for (let i = 0; i < repeatCount; i++) {
                            // Random play duration
                            const duration = Math.random() *
                                (this.config.playback.play_duration[1] - this.config.playback.play_duration[0]) +
                                this.config.playback.play_duration[0];

                            await this.simulateListening(page, duration);

                            // Simulate skip forward and back (like original system)
                            if (i < repeatCount - 1) {
                                try {
                                    await page.click('[data-testid="control-button-skip-forward"]');
                                    await page.waitForTimeout(2000);
                                    await page.click('[data-testid="control-button-skip-back"]');
                                    await page.waitForTimeout(1000);
                                } catch (skipError) {
                                    this.logger.warn('Skip controls not available:', skipError);
                                }
                            }

                            // Update successful streams (similar to Values.addSuccessfulStreams())
                            this.sessionManager.updateSessionStats(sessionData, 'successfulStreams', 1);
                            this.sessionManager.updateSessionStats(sessionData, 'totalPlaytime', duration);
                        }
                    } else {
                        this.sessionManager.updateSessionStats(sessionData, 'failedStreams', 1);
                    }
                } catch (trackError) {
                    this.logger.error(`Error playing track ${trackUrl}:`, trackError);
                    this.sessionManager.updateSessionStats(sessionData, 'failedStreams', 1);
                    this.sessionManager.addSessionError(sessionData, trackError);
                }

                // Delay between tracks
                const delay = Math.random() *
                    (this.config.playback.session_delay[1] - this.config.playback.session_delay[0]) +
                    this.config.playback.session_delay[0];
                await page.waitForTimeout(delay * 1000);
            }

            // Save cookies for session persistence (similar to original session management)
            const cookies = await context.cookies();
            await this.sessionManager.saveCookies(sessionData, cookies);

            this.sessionManager.updateSessionStatus(sessionData, 'completed');
            this.logger.info(`Session ${sessionId} completed successfully`);

        } catch (error) {
            this.logger.error(`Session ${sessionId} failed:`, error);
            if (sessionData) {
                this.sessionManager.updateSessionStatus(sessionData, 'failed');
                this.sessionManager.addSessionError(sessionData, error);
            }
            if (proxy) {
                this.proxyManager.markProxyUsed(proxy, false); // Mark proxy as failed
            }
        } finally {
            if (context) await context.close();
            if (browser) await browser.close();
            if (sessionData) {
                this.sessionManager.cleanupSession(sessionData);
            }
        }
    }

    // Parse proxy from account configuration
    parseProxyFromAccount(account) {
        if (!account.proxy) {
            return null;
        }

        // Handle proxy format: host:port or host:port:username:password
        const proxyParts = account.proxy.split(':');

        if (proxyParts.length >= 2) {
            const proxy = {
                host: proxyParts[0],
                port: parseInt(proxyParts[1]),
                type: 'http', // Default to HTTP
                username: proxyParts[2] || '',
                password: proxyParts[3] || ''
            };

            this.logger.info(`Parsed proxy from account: ${proxy.host}:${proxy.port}`);
            return proxy;
        }

        return null;
    }

    // Start multiple sessions, now primarily managed by Scheduler or specific commands
    async startInitialSessions(sessionCount = 1) {
        this.logger.info(`Starting initial ${sessionCount} sessions as per direct command.`);
        if (!this.accountsConfig || !this.accountsConfig.accounts || this.accountsConfig.accounts.length === 0) {
            this.logger.error("No accounts configured. Cannot start sessions.");
            return;
        }

        const numToStart = Math.min(sessionCount, this.accountsConfig.accounts.length);
        this.logger.info(`Attempting to start ${numToStart} sessions.`);

        // This method is now more about an initial burst or a specific command
        // rather than the primary way sessions are managed if Scheduler is active.
        await this.runMoreSessions(numToStart);
    }

    // Method for Scheduler to start more sessions
    async runMoreSessions(count) {
        this.logger.info(`Received request to run ${count} more sessions.`);
        if (!this.accountsConfig || !this.accountsConfig.accounts || this.accountsConfig.accounts.length === 0) {
            this.logger.error("No accounts loaded. Cannot start new sessions.");
            return;
        }

        const availableAccounts = this.accountsConfig.accounts;
        const currentlyActiveSessions = this.sessionManager.getAllSessions();
        let startedCount = 0;

        for (let i = 0; i < count; i++) {
            // Find an account that is not currently in an active session
            // This is a simplified selection logic. A more robust system would track account usage, cooldowns, etc.
            const nextAccount = availableAccounts.find(acc =>
                !currentlyActiveSessions.some(sess => sess.account && sess.account.email === acc.email && sess.status !== 'failed' && sess.status !== 'completed' && sess.status !== 'stopped')
            );

            if (!nextAccount) {
                this.logger.warn("No available (unused) accounts to start a new session. Needed more but couldn't find one.");
                break; // No more available accounts
            }

            // sessionId could be generated by sessionManager.createSession or passed if already known.
            // For simplicity, let runSession generate it or use one from sessionManager.
            const sessionId = this.sessionManager.generateSessionId();
            let proxy = this.parseProxyFromAccount(nextAccount);
            if (!proxy && this.accountsConfig.proxies && this.accountsConfig.proxies.length > 0) {
                // Basic round-robin for proxies if not specified in account
                // This proxy selection logic might need to be more sophisticated (e.g., via ProxyManager)
                const proxyIndex = (currentlyActiveSessions.length + startedCount) % this.accountsConfig.proxies.length;
                proxy = this.accountsConfig.proxies[proxyIndex];
            }

            this.logger.info(`Starting new session ${sessionId} for account ${nextAccount.email}. Proxy: ${proxy ? proxy.host : 'none'}`);
            // Run session asynchronously without awaiting all of them here to allow parallel startup.
            this.runSession(sessionId, nextAccount, proxy).catch(error => {
                this.logger.error(`Error during session ${sessionId} execution:`, error);
                // Error handling for individual session failure is within runSession
            });
            startedCount++;
            await new Promise(resolve => setTimeout(resolve, this.configManager.getSessionSettings().stagger_delay || 2000)); // Stagger
        }
        this.logger.info(`Successfully initiated ${startedCount} new sessions.`);
    }

    // Method for Scheduler to stop some sessions
    async stopSomeSessions(count) {
        this.logger.info(`Received request to stop ${count} sessions.`);
        const activeSessions = this.sessionManager.getAllSessions().filter(s => s.status === 'running' || s.status === 'idle' || s.status === 'initializing' || s.status === 'paused');

        if (activeSessions.length === 0) {
            this.logger.info("No active sessions to stop.");
            return;
        }

        const numToStop = Math.min(count, activeSessions.length);
        this.logger.info(`Attempting to stop ${numToStop} sessions.`);

        for (let i = 0; i < numToStop; i++) {
            // Simple strategy: stop the "oldest" running session or least active.
            // For now, just take the first ones from the filtered list.
            // A more sophisticated strategy could involve session activity, age, or other metrics.
            const sessionToStop = activeSessions[i];
            if (sessionToStop && sessionToStop.id) {
                this.logger.info(`Stopping session ${sessionToStop.id}.`);
                // This needs to gracefully stop the browser and cleanup.
                // Assuming cleanupSession handles status updates and resource release.
                // We need a way to signal the Playwright browser to close.
                // This might involve finding the browser instance associated with the session.
                // For now, we'll call cleanupSession which updates status and removes from active.
                // The actual browser closing needs to be handled if not already done by runSession's finally block on error.

                // Find the browser instance to close it. This is a challenge as runSession manages its own browser.
                // One way is to store browser instances in SessionManager or make runSession responsive to a stop signal.
                // For now, just marking as 'stopped'. Actual resource cleanup needs robust handling.
                this.sessionManager.updateSessionStatus(sessionToStop.id, 'stopped', 'Scheduled stop by Scheduler');
                this.sessionManager.cleanupSession(sessionToStop.id, 'stopped', 'Scheduled stop by Scheduler');
                // TODO: Ensure browser associated with sessionToStop.id is actually closed.
                // This might require a map of sessionId to browser instance or a more direct control mechanism.
            }
        }
        this.logger.info(`Successfully stopped ${numToStop} sessions.`);
    }

    async initializeAndStart() {
        await this.scheduler.initialize();
        this.scheduler.start();

        // Start the dashboard
        // Get dashboard port from config, or use default 3000
        const dashboardSettings = this.configManager.getFullAutomationConfig()?.dashboard; // Use getFullAutomationConfig()
        const dashboardPort = dashboardSettings?.port || 3000;
        this.dashboard.start(dashboardPort);

        const initialSessionCount = this.configManager.getSessionSettings().initial_startup_count || 0;
        if (initialSessionCount > 0 && this.scheduler.shifts.length === 0) {
             this.logger.info(`No shifts defined by scheduler, starting initial ${initialSessionCount} sessions directly.`);
             await this.startInitialSessions(initialSessionCount);
        } else if (this.scheduler.shifts.length > 0) {
            this.logger.info("Scheduler is active and will manage session capacity based on shifts.");
        } else {
            this.logger.info("No initial sessions to start, and scheduler has no shifts. System idle unless dashboard accessed.");
        }
    }
}

// Main execution
async function main() {
    const automation = new SpotifyAutomation();
    await automation.initializeAndStart(); // This now also starts the dashboard

    // For a script, you might need to add a way to keep it alive or handle signals.
    process.on('SIGINT', async () => {
        automation.logger.info("SIGINT received. Shutting down scheduler and active sessions...");
        // Here you would add logic to stop all cron jobs and gracefully terminate active sessions.
        // For example, stop all sessions:
        const allActive = automation.sessionManager.getAllSessions().length;
        if (allActive > 0) {
           await automation.stopSomeSessions(allActive);
        }
        automation.logger.info("Shutdown complete.");
        process.exit(0);
    });

    automation.logger.info("Spotify Automation system is running. Scheduler is active. Press Ctrl+C to exit.");
    // Keep alive for scheduler (if not in a server context like Express)
    // This is a simple way; a more robust solution might involve an empty interval or server.
    if (!module.parent) { // Only run keep-alive if this is the main module
        setInterval(() => { /* Keep process alive for cron jobs */ }, 1000 * 60 * 60);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error("Unhandled error in main execution:", error);
        process.exit(1);
    });
}

module.exports = SpotifyAutomation;
