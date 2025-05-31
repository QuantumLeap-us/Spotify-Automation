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

class SpotifyAutomation {
    constructor() {
        this.logger = new Logger();
        this.configManager = new ConfigManager();
        this.sessionManager = new SessionManager();
        this.proxyManager = new ProxyManager();
        this.stealthConfig = new StealthConfig();
        this.captchaSolver = new CaptchaSolver(process.env.CAPTCHA_API_KEY);
        this.config = this.loadConfig();
        this.sessions = new Map();
    }

    // Load configuration from YAML file
    loadConfig() {
        try {
            const configPath = path.join(__dirname, '../config/accounts.yaml');
            const configFile = fs.readFileSync(configPath, 'utf8');
            return YAML.parse(configFile);
        } catch (error) {
            this.logger.error('Failed to load config:', error);
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

    // Start multiple sessions
    async start(sessionCount = 1) {
        this.logger.info(`Starting ${sessionCount} sessions`);

        const promises = [];

        for (let i = 0; i < sessionCount; i++) {
            const account = this.config.accounts[i % this.config.accounts.length];

            // Try to get proxy from account first, then from proxy pool
            let proxy = this.parseProxyFromAccount(account);
            if (!proxy && this.config.proxies && this.config.proxies.length > 0) {
                proxy = this.config.proxies[i % this.config.proxies.length];
            }

            this.logger.info(`Session ${i + 1}: Account ${account.email}, Proxy: ${proxy ? proxy.host + ':' + proxy.port : 'none'}`);

            const sessionPromise = this.runSession(i + 1, account, proxy);
            promises.push(sessionPromise);

            // Stagger session starts
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        await Promise.all(promises);
        this.logger.info('All sessions completed');
    }
}

// Main execution
async function main() {
    const automation = new SpotifyAutomation();
    const sessionCount = process.env.SESSION_COUNT || 3;

    await automation.start(parseInt(sessionCount));
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SpotifyAutomation;
