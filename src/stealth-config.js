// Stealth configuration for geo-matched browser fingerprinting

const ConfigManager = require('./config-manager');

class StealthConfig {
    constructor() {
        this.configManager = new ConfigManager();
        // Geographic-based configuration mapping
        this.geoProfiles = {
            // United States
            'US': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
                ],
                languages: ['en-US', 'en'],
                timezones: ['America/New_York', 'America/Los_Angeles', 'America/Chicago', 'America/Denver'],
                currencies: ['USD'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 },
                    { width: 1440, height: 900 },
                    { width: 1536, height: 864 }
                ],
                platforms: ['Win32', 'MacIntel'],
                webglVendors: ['Google Inc.', 'Mozilla'],
                webglRenderers: [
                    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)'
                ]
            },

            // United Kingdom
            'GB': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                languages: ['en-GB', 'en'],
                timezones: ['Europe/London'],
                currencies: ['GBP'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 },
                    { width: 1440, height: 900 }
                ],
                platforms: ['Win32', 'MacIntel', 'Linux x86_64'],
                webglVendors: ['Google Inc.', 'Mozilla'],
                webglRenderers: [
                    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)'
                ]
            },

            // Germany
            'DE': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
                ],
                languages: ['de-DE', 'de', 'en'],
                timezones: ['Europe/Berlin'],
                currencies: ['EUR'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 },
                    { width: 1440, height: 900 }
                ],
                platforms: ['Win32', 'Linux x86_64'],
                webglVendors: ['Google Inc.', 'Mozilla'],
                webglRenderers: [
                    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11)'
                ]
            },

            // Canada
            'CA': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                languages: ['en-CA', 'fr-CA', 'en'],
                timezones: ['America/Toronto', 'America/Vancouver', 'America/Montreal'],
                currencies: ['CAD'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 },
                    { width: 1440, height: 900 }
                ],
                platforms: ['Win32', 'MacIntel'],
                webglVendors: ['Google Inc.', 'Mozilla'],
                webglRenderers: [
                    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)'
                ]
            },

            // Hong Kong
            'HK': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                languages: ['en-HK', 'en', 'zh-HK', 'zh'],
                timezones: ['Asia/Hong_Kong'],
                currencies: ['HKD'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 },
                    { width: 1440, height: 900 }
                ],
                platforms: ['Win32', 'MacIntel'],
                webglVendors: ['Google Inc.', 'Mozilla'],
                webglRenderers: [
                    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)'
                ]
            },

            // Australia
            'AU': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                languages: ['en-AU', 'en'],
                timezones: ['Australia/Sydney', 'Australia/Melbourne', 'Australia/Perth'],
                currencies: ['AUD'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 },
                    { width: 1440, height: 900 }
                ],
                platforms: ['Win32', 'MacIntel'],
                webglVendors: ['Google Inc.', 'Mozilla'],
                webglRenderers: [
                    'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
                    'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)'
                ]
            },

            // Default fallback
            'DEFAULT': {
                userAgents: [
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ],
                languages: ['en-US', 'en'],
                timezones: ['America/New_York'],
                currencies: ['USD'],
                screenSizes: [
                    { width: 1920, height: 1080 },
                    { width: 1366, height: 768 }
                ],
                platforms: ['Win32', 'MacIntel'],
                webglVendors: ['Google Inc.'],
                webglRenderers: ['ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)']
            }
        };

        // Proxy location detection patterns
        this.proxyLocationPatterns = {
            'us': 'US', 'usa': 'US', 'united-states': 'US', 'america': 'US',
            'uk': 'GB', 'gb': 'GB', 'britain': 'GB', 'england': 'GB', 'london': 'GB',
            'de': 'DE', 'germany': 'DE', 'deutschland': 'DE', 'berlin': 'DE',
            'ca': 'CA', 'canada': 'CA', 'toronto': 'CA', 'vancouver': 'CA',
            'au': 'AU', 'australia': 'AU', 'sydney': 'AU', 'melbourne': 'AU',
            'hk': 'HK', 'hong-kong': 'HK', 'hongkong': 'HK', 'hong_kong': 'HK'
        };
    }

    // Detect proxy location from hostname or IP
    detectProxyLocation(proxy) {
        if (!proxy || !proxy.host) {
            return 'DEFAULT';
        }

        // If real location is already detected, use it first
        if (proxy.detectedLocation && this.geoProfiles[proxy.detectedLocation]) {
            return proxy.detectedLocation;
        }

        const hostname = proxy.host.toLowerCase();

        // Check for location patterns in hostname
        for (const [pattern, country] of Object.entries(this.proxyLocationPatterns)) {
            if (hostname.includes(pattern)) {
                return country;
            }
        }

        // Check for common proxy provider patterns
        if (hostname.includes('smartproxy')) {
            // Smartproxy format: us-pr.smartproxy.com
            const parts = hostname.split('.');
            if (parts.length > 0) {
                const locationPart = parts[0].split('-')[0];
                return this.proxyLocationPatterns[locationPart] || 'DEFAULT';
            }
        }

        // Check for other proxy provider patterns
        if (hostname.includes('proxy')) {
            // Look for country codes in various positions
            const matches = hostname.match(/([a-z]{2})-?(?:proxy|pr|node)/);
            if (matches && matches[1]) {
                return this.proxyLocationPatterns[matches[1]] || 'DEFAULT';
            }
        }

        return 'DEFAULT';
    }

    // Get geo-matched configuration based on proxy
    getGeoMatchedConfig(proxy, options = {}) {
        const location = this.detectProxyLocation(proxy);
        const profile = this.geoProfiles[location] || this.geoProfiles['DEFAULT'];

        // Get language preferences from config
        const languagePrefs = this.configManager.getLanguagePreferences();
        const shouldPreferEnglish = options.preferEnglish !== undefined ?
            options.preferEnglish : languagePrefs.prefer_english;

        // Filter languages based on preferences
        let availableLanguages = profile.languages;
        if (shouldPreferEnglish) {
            // Use configured fallback languages or filter for English
            const fallbackLanguages = languagePrefs.fallback_languages[location];
            if (fallbackLanguages) {
                availableLanguages = fallbackLanguages;
            } else {
                // Prioritize English variants for international use
                availableLanguages = profile.languages.filter(lang => lang.startsWith('en-') || lang === 'en');
                if (availableLanguages.length === 0) {
                    availableLanguages = ['en-US', 'en']; // Fallback to English
                }
            }
        }

        return {
            location: location,
            profile: profile,
            userAgent: this.getRandomFromArray(profile.userAgents),
            language: this.getRandomFromArray(availableLanguages),
            timezone: this.getRandomFromArray(profile.timezones),
            currency: this.getRandomFromArray(profile.currencies),
            screenSize: this.getRandomFromArray(profile.screenSizes),
            platform: this.getRandomFromArray(profile.platforms),
            webglVendor: this.getRandomFromArray(profile.webglVendors),
            webglRenderer: this.getRandomFromArray(profile.webglRenderers)
        };
    }

    // Helper method to get random item from array
    getRandomFromArray(array) {
        return array[Math.floor(Math.random() * array.length)];
    }

    // Get random user agent (legacy method for backward compatibility)
    getRandomUserAgent() {
        const defaultProfile = this.geoProfiles['DEFAULT'];
        return this.getRandomFromArray(defaultProfile.userAgents);
    }

    // Get random screen size (legacy method for backward compatibility)
    getRandomScreenSize() {
        const defaultProfile = this.geoProfiles['DEFAULT'];
        return this.getRandomFromArray(defaultProfile.screenSizes);
    }

    // Get random language (legacy method for backward compatibility)
    getRandomLanguage() {
        const defaultProfile = this.geoProfiles['DEFAULT'];
        return this.getRandomFromArray(defaultProfile.languages);
    }

    // Get random timezone (legacy method for backward compatibility)
    getRandomTimezone() {
        const defaultProfile = this.geoProfiles['DEFAULT'];
        return this.getRandomFromArray(defaultProfile.timezones);
    }

    // Get random platform (legacy method for backward compatibility)
    getRandomPlatform() {
        const defaultProfile = this.geoProfiles['DEFAULT'];
        return this.getRandomFromArray(defaultProfile.platforms);
    }

    // Generate random WebGL parameters
    getRandomWebGLParams() {
        return {
            vendor: this.getRandomWebGLVendor(),
            renderer: this.getRandomWebGLRenderer()
        };
    }

    getRandomWebGLVendor() {
        const vendors = [
            'Google Inc.',
            'Mozilla',
            'WebKit'
        ];
        return vendors[Math.floor(Math.random() * vendors.length)];
    }

    getRandomWebGLRenderer() {
        const renderers = [
            'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.100.8681)',
            'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11-27.21.14.5671)',
            'ANGLE (AMD, AMD Radeon RX 580 Series Direct3D11 vs_5_0 ps_5_0, D3D11-27.20.1020.2002)'
        ];
        return renderers[Math.floor(Math.random() * renderers.length)];
    }

    // Get comprehensive geo-matched settings based on proxy
    getGeoMatchedSettings(proxy, options = {}) {
        const geoConfig = this.getGeoMatchedConfig(proxy, options);

        return {
            location: geoConfig.location,
            userAgent: geoConfig.userAgent,
            viewport: geoConfig.screenSize,
            language: geoConfig.language,
            timezone: geoConfig.timezone,
            currency: geoConfig.currency,
            platform: geoConfig.platform,
            webgl: {
                vendor: geoConfig.webglVendor,
                renderer: geoConfig.webglRenderer
            },
            // Additional fingerprint randomization
            hardwareConcurrency: Math.floor(Math.random() * 8) + 2, // 2-10 cores
            deviceMemory: [2, 4, 8, 16][Math.floor(Math.random() * 4)], // GB
            colorDepth: [24, 32][Math.floor(Math.random() * 2)],
            pixelDepth: [24, 32][Math.floor(Math.random() * 2)],
            // Geo-specific additional settings
            acceptLanguage: this.buildAcceptLanguage(geoConfig.language),
            acceptEncoding: 'gzip, deflate, br',
            connection: 'keep-alive'
        };
    }

    // Build Accept-Language header based on primary language
    buildAcceptLanguage(primaryLanguage) {
        const languageMap = {
            'en-US': 'en-US,en;q=0.9',
            'en-GB': 'en-GB,en;q=0.9',
            'en-CA': 'en-CA,en;q=0.9,fr;q=0.8',
            'en-AU': 'en-AU,en;q=0.9',
            'de-DE': 'de-DE,de;q=0.9,en;q=0.8',
            'fr-CA': 'fr-CA,fr;q=0.9,en;q=0.8',
            'zh-HK': 'zh-HK,zh;q=0.9,en;q=0.8',
            'en-HK': 'en-HK,en;q=0.9,zh;q=0.8'
        };

        return languageMap[primaryLanguage] || 'en-US,en;q=0.9';
    }

    // Get comprehensive random settings (legacy method for backward compatibility)
    getRandomSettings() {
        return this.getGeoMatchedSettings(null); // Use default profile
    }

    // Generate stealth script for browser context
    getStealthScript() {
        return `
            // Remove webdriver property
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });

            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        0: {type: "application/x-google-chrome-pdf", suffixes: "pdf", description: "Portable Document Format", enabledPlugin: Plugin},
                        description: "Portable Document Format",
                        filename: "internal-pdf-viewer",
                        length: 1,
                        name: "Chrome PDF Plugin"
                    }
                ],
            });

            // Override permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );

            // Override chrome runtime
            if (!window.chrome) {
                window.chrome = {};
            }
            if (!window.chrome.runtime) {
                window.chrome.runtime = {};
            }

            // Override iframe contentWindow
            const getParameter = WebGLRenderingContext.getParameter;
            const getParameterWebGL2 = WebGL2RenderingContext.getParameter;

            WebGLRenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return '${this.getRandomWebGLVendor()}';
                }
                if (parameter === 37446) {
                    return '${this.getRandomWebGLRenderer()}';
                }
                return getParameter(parameter);
            };

            WebGL2RenderingContext.prototype.getParameter = function(parameter) {
                if (parameter === 37445) {
                    return '${this.getRandomWebGLVendor()}';
                }
                if (parameter === 37446) {
                    return '${this.getRandomWebGLRenderer()}';
                }
                return getParameterWebGL2(parameter);
            };
        `;
    }

    // Get random mouse movement pattern
    getRandomMousePattern() {
        const patterns = [
            'linear',
            'bezier',
            'arc',
            'zigzag'
        ];
        return patterns[Math.floor(Math.random() * patterns.length)];
    }

    // Get random typing speed (characters per minute)
    getRandomTypingSpeed() {
        return Math.floor(Math.random() * 100) + 150; // 150-250 CPM
    }

    // Get random scroll behavior
    getRandomScrollBehavior() {
        return {
            speed: Math.floor(Math.random() * 500) + 100, // 100-600ms
            distance: Math.floor(Math.random() * 300) + 100, // 100-400px
            pattern: ['smooth', 'instant'][Math.floor(Math.random() * 2)]
        };
    }

    // Generate fake user agent based on location
    generateFakeUserAgent(location) {
        const profile = this.geoProfiles[location] || this.geoProfiles['DEFAULT'];
        return this.getRandomFromArray(profile.userAgents);
    }
}

module.exports = StealthConfig;
