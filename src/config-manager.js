const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.config = this.loadConfig();
    }

    // Load automation configuration
    loadConfig() {
        try {
            const configPath = path.join(__dirname, '../config/automation.yaml');
            const configFile = fs.readFileSync(configPath, 'utf8');
            const config = YAML.parse(configFile);
            
            // Set defaults if not specified
            return this.setDefaults(config);
        } catch (error) {
            console.warn('Failed to load automation config, using defaults:', error.message);
            return this.getDefaultConfig();
        }
    }

    // Set default values for missing configuration
    setDefaults(config) {
        const defaults = this.getDefaultConfig();
        
        return {
            language: { ...defaults.language, ...config.language },
            browser: { ...defaults.browser, ...config.browser },
            captcha: { ...defaults.captcha, ...config.captcha },
            proxy: { ...defaults.proxy, ...config.proxy },
            logging: { ...defaults.logging, ...config.logging },
            session: { ...defaults.session, ...config.session },
            error_handling: { ...defaults.error_handling, ...config.error_handling },
            development: { ...defaults.development, ...config.development }
        };
    }

    // Get default configuration
    getDefaultConfig() {
        return {
            language: {
                prefer_english: true,
                fallback_languages: {
                    HK: ['en-HK', 'en'],
                    US: ['en-US', 'en'],
                    GB: ['en-GB', 'en'],
                    CA: ['en-CA', 'en', 'fr-CA'],
                    AU: ['en-AU', 'en'],
                    DE: ['en', 'de-DE'],
                    DEFAULT: ['en-US', 'en']
                }
            },
            browser: {
                headless: false,
                timeouts: {
                    page_load: 30000,
                    element_wait: 10000,
                    login_process: 60000,
                    captcha_solve: 120000
                },
                human_behavior: {
                    typing_delay: [50, 150],
                    mouse_movement: true,
                    scroll_behavior: true,
                    click_delay: [100, 300]
                }
            },
            captcha: {
                auto_solve: true,
                service: "2captcha",
                timeout: 120,
                manual_fallback: true,
                manual_wait_time: 60
            },
            proxy: {
                detect_real_location: true,
                connection_timeout: 15,
                retry_attempts: 3
            },
            logging: {
                level: "info",
                geo_matching_details: true,
                browser_details: false
            },
            session: {
                max_concurrent: 5,
                timeout: 30,
                cleanup_interval: 10
            },
            error_handling: {
                max_retries: 3,
                retry_delay: 5,
                continue_on_error: true
            },
            development: {
                debug_mode: false,
                keep_browser_open: false,
                extended_timeouts: false,
                mock_captcha: false
            }
        };
    }

    // Get language preferences
    getLanguagePreferences() {
        return this.config.language;
    }

    // Get browser settings
    getBrowserSettings() {
        return this.config.browser;
    }

    // Get captcha settings
    getCaptchaSettings() {
        return this.config.captcha;
    }

    // Get proxy settings
    getProxySettings() {
        return this.config.proxy;
    }

    // Get logging settings
    getLoggingSettings() {
        return this.config.logging;
    }

    // Get session settings
    getSessionSettings() {
        return this.config.session;
    }

    // Get error handling settings
    getErrorHandlingSettings() {
        return this.config.error_handling;
    }

    // Get development settings
    getDevelopmentSettings() {
        return this.config.development;
    }

    // Check if English should be preferred
    shouldPreferEnglish() {
        return this.config.language.prefer_english;
    }

    // Get fallback languages for a location
    getFallbackLanguages(location) {
        return this.config.language.fallback_languages[location] || 
               this.config.language.fallback_languages.DEFAULT;
    }

    // Get typing delay range
    getTypingDelay() {
        const delay = this.config.browser.human_behavior.typing_delay;
        return Math.random() * (delay[1] - delay[0]) + delay[0];
    }

    // Get click delay range
    getClickDelay() {
        const delay = this.config.browser.human_behavior.click_delay;
        return Math.random() * (delay[1] - delay[0]) + delay[0];
    }

    // Check if human behavior simulation is enabled
    isHumanBehaviorEnabled() {
        return {
            typing: this.config.browser.human_behavior.typing_delay,
            mouse: this.config.browser.human_behavior.mouse_movement,
            scroll: this.config.browser.human_behavior.scroll_behavior,
            click: this.config.browser.human_behavior.click_delay
        };
    }

    // Get timeout for specific operation
    getTimeout(operation) {
        return this.config.browser.timeouts[operation] || 30000;
    }

    // Check if debug mode is enabled
    isDebugMode() {
        return this.config.development.debug_mode;
    }

    // Check if browser should stay open
    shouldKeepBrowserOpen() {
        return this.config.development.keep_browser_open;
    }

    // Check if captcha auto-solve is enabled
    isCaptchaAutoSolveEnabled() {
        return this.config.captcha.auto_solve;
    }

    // Check if real IP detection is enabled
    isRealIPDetectionEnabled() {
        return this.config.proxy.detect_real_location;
    }

    // Get full configuration
    getFullConfig() {
        return this.config;
    }

    // Update configuration at runtime
    updateConfig(path, value) {
        const keys = path.split('.');
        let current = this.config;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    // Save configuration to file
    saveConfig() {
        try {
            const configPath = path.join(__dirname, '../config/automation.yaml');
            const yamlString = YAML.stringify(this.config);
            fs.writeFileSync(configPath, yamlString, 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save config:', error);
            return false;
        }
    }
}

module.exports = ConfigManager;
