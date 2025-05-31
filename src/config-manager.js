const YAML = require('yaml');
const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.automationConfig = this.loadAutomationConfig(); // Renamed to avoid confusion
    }

    // Load a specific YAML configuration file by name
    async loadConfig(fileName = 'automation.yaml') {
        try {
            const configPath = path.join(__dirname, '../config/', fileName);
            if (!fs.existsSync(configPath)) {
                // console.warn(`Configuration file ${fileName} not found.`); // Less noisy
                return null; // Return null if file doesn't exist, let caller handle defaults
            }
            const configFile = fs.readFileSync(configPath, 'utf8');
            const config = YAML.parse(configFile);
            
            // For the main automation.yaml, we apply defaults. For others, we might not.
            if (fileName === 'automation.yaml') {
                return this.setDefaults(config);
            }
            return config; // Return parsed config, or null if error/not found
        } catch (error) {
            console.error(`Failed to load config file ${fileName}:`, error.message);
            // For the main automation.yaml, fallback to defaults. For others, throw or return null.
            if (fileName === 'automation.yaml') {
                return this.getDefaultConfig();
            }
            throw error; // Rethrow for other files so caller knows it failed
        }
    }

    // Load main automation configuration
    loadAutomationConfig() {
        return this.loadConfig('automation.yaml');
    }


    // Set default values for missing automation configuration
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
        return this.automationConfig.language;
    }

    // Get browser settings
    getBrowserSettings() {
        return this.automationConfig.browser;
    }

    // Get captcha settings
    getCaptchaSettings() {
        return this.automationConfig.captcha;
    }

    // Get proxy settings
    getProxySettings() {
        return this.automationConfig.proxy;
    }

    // Get logging settings
    getLoggingSettings() {
        return this.automationConfig.logging;
    }

    // Get session settings
    getSessionSettings() {
        return this.automationConfig.session;
    }

    // Get error handling settings
    getErrorHandlingSettings() {
        return this.automationConfig.error_handling;
    }

    // Get development settings
    getDevelopmentSettings() {
        return this.automationConfig.development;
    }

    // Check if English should be preferred
    shouldPreferEnglish() {
        return this.automationConfig.language.prefer_english;
    }

    // Get fallback languages for a location
    getFallbackLanguages(location) {
        return this.automationConfig.language.fallback_languages[location] ||
               this.automationConfig.language.fallback_languages.DEFAULT;
    }

    // Get typing delay range
    getTypingDelay() {
        const delay = this.automationConfig.browser.human_behavior.typing_delay;
        return Math.random() * (delay[1] - delay[0]) + delay[0];
    }

    // Get click delay range
    getClickDelay() {
        const delay = this.automationConfig.browser.human_behavior.click_delay;
        return Math.random() * (delay[1] - delay[0]) + delay[0];
    }

    // Check if human behavior simulation is enabled
    isHumanBehaviorEnabled() {
        return {
            typing: this.automationConfig.browser.human_behavior.typing_delay,
            mouse: this.automationConfig.browser.human_behavior.mouse_movement,
            scroll: this.automationConfig.browser.human_behavior.scroll_behavior,
            click: this.automationConfig.browser.human_behavior.click_delay
        };
    }

    // Get timeout for specific operation
    getTimeout(operation) {
        return this.automationConfig.browser.timeouts[operation] || 30000;
    }

    // Check if debug mode is enabled
    isDebugMode() {
        return this.automationConfig.development.debug_mode;
    }

    // Check if browser should stay open
    shouldKeepBrowserOpen() {
        return this.automationConfig.development.keep_browser_open;
    }

    // Check if captcha auto-solve is enabled
    isCaptchaAutoSolveEnabled() {
        return this.automationConfig.captcha.auto_solve;
    }

    // Check if real IP detection is enabled
    isRealIPDetectionEnabled() {
        return this.automationConfig.proxy.detect_real_location;
    }

    // Get full automation configuration
    getFullAutomationConfig() { // Renamed for clarity
        return this.automationConfig;
    }

    // Update automation configuration at runtime
    updateAutomationConfig(path, value) { // Renamed for clarity
        const keys = path.split('.');
        let current = this.automationConfig;
        
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) {
                current[keys[i]] = {};
            }
            current = current[keys[i]];
        }
        
        current[keys[keys.length - 1]] = value;
    }

    // Save automation configuration to file
    saveAutomationConfig() { // Renamed for clarity
        try {
            const configPath = path.join(__dirname, '../config/automation.yaml');
            const yamlString = YAML.stringify(this.automationConfig);
            fs.writeFileSync(configPath, yamlString, 'utf8');
            return true;
        } catch (error) {
            console.error('Failed to save automation config:', error);
            return false;
        }
    }
}

module.exports = ConfigManager;
