const Logger = require('./logger');

class CaptchaSolver {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.logger = new Logger('captcha-solver');
        this.solver = null;

        if (apiKey) {
            try {
                const { Solver } = require('2captcha');
                this.solver = new Solver(apiKey);
                this.logger.info('2captcha solver initialized');
            } catch (error) {
                this.logger.error('Failed to initialize 2captcha:', error);
            }
        } else {
            this.logger.warn('No 2captcha API key provided');
        }
    }

    // Detect if page has captcha
    async detectCaptcha(page) {
        try {
            const pageContent = await page.textContent('body');

            // Detect captcha page content
            if (pageContent.includes('verify that you are human') ||
                pageContent.includes('reCAPTCHA') ||
                pageContent.includes('prove you are not a robot') ||
                pageContent.includes('I\'m not a robot') ||
                pageContent.includes('verification') ||
                pageContent.includes('challenge')) {
                this.logger.info('Detected captcha page');
                return true;
            }

            // Detect reCAPTCHA iframe
            const recaptchaFrame = await page.locator('iframe[src*="recaptcha"]').first();
            if (await recaptchaFrame.isVisible()) {
                this.logger.info('Detected reCAPTCHA iframe');
                return true;
            }

            return false;

        } catch (error) {
            this.logger.error('Error detecting captcha:', error);
            return false;
        }
    }

    // Get reCAPTCHA site key
    async getSiteKey(page) {
        try {
            // Method 1: Get from iframe src
            const recaptchaFrame = await page.locator('iframe[src*="recaptcha"]').first();
            if (await recaptchaFrame.isVisible()) {
                const src = await recaptchaFrame.getAttribute('src');
                const siteKeyMatch = src.match(/k=([^&]+)/);
                if (siteKeyMatch) {
                    this.logger.info(`Found site key from iframe: ${siteKeyMatch[1]}`);
                    return siteKeyMatch[1];
                }
            }

            // Method 2: Get from page scripts
            const siteKey = await page.evaluate(() => {
                // Look for grecaptcha configuration
                if (window.grecaptcha && window.grecaptcha.render) {
                    return window.grecaptcha.sitekey;
                }

                // Look for data-sitekey attribute
                const recaptchaDiv = document.querySelector('[data-sitekey]');
                if (recaptchaDiv) {
                    return recaptchaDiv.getAttribute('data-sitekey');
                }

                // Look for site key in scripts
                const scripts = document.querySelectorAll('script');
                for (const script of scripts) {
                    const content = script.textContent || script.innerHTML;
                    const match = content.match(/sitekey['"]\s*:\s*['"]([^'"]+)['"]/);
                    if (match) {
                        return match[1];
                    }
                }

                return null;
            });

            if (siteKey) {
                this.logger.info(`Found site key from page: ${siteKey}`);
                return siteKey;
            }

            // Method 3: Common Spotify site keys (if other methods fail)
            const commonSiteKeys = [
                '6LfCVLAUAAAAALFwwRnnCJ12DalriUGbj8FW_J39', // Common Spotify key
                '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'  // Google test key
            ];

            this.logger.warn('Could not find site key, using common Spotify key');
            return commonSiteKeys[0];

        } catch (error) {
            this.logger.error('Error getting site key:', error);
            return null;
        }
    }

    // Use 2captcha to solve reCAPTCHA
    async solveCaptcha(page, siteKey = null) {
        if (!this.solver) {
            this.logger.error('2captcha solver not initialized');
            return null;
        }

        try {
            const currentUrl = page.url();

            // If no site key provided, try to get it automatically
            if (!siteKey) {
                siteKey = await this.getSiteKey(page);
                if (!siteKey) {
                    this.logger.error('Could not find reCAPTCHA site key');
                    return null;
                }
            }

            this.logger.info(`Solving reCAPTCHA for URL: ${currentUrl}`);
            this.logger.info(`Using site key: ${siteKey}`);

            // Submit captcha to 2captcha
            const result = await this.solver.recaptcha({
                googlekey: siteKey,
                pageurl: currentUrl,
                invisible: 0 // Set to 0 for visible reCAPTCHA
            });

            this.logger.info('reCAPTCHA solved successfully');
            return result.data;

        } catch (error) {
            this.logger.error('Error solving captcha:', error);
            return null;
        }
    }

    // Submit captcha response to page
    async submitCaptchaResponse(page, response) {
        try {
            this.logger.info('Submitting captcha response to page');

            // Inject captcha response to page
            await page.evaluate((token) => {
                // Method 1: Set directly to textarea
                const responseTextarea = document.querySelector('textarea[name="g-recaptcha-response"]');
                if (responseTextarea) {
                    responseTextarea.value = token;
                    responseTextarea.style.display = 'block';
                }

                // Method 2: Call grecaptcha callback
                if (window.grecaptcha && window.grecaptcha.getResponse) {
                    window.grecaptcha.execute();
                }

                // Method 3: Trigger verification complete event
                if (window.onRecaptchaSuccess) {
                    window.onRecaptchaSuccess(token);
                }

                // Method 4: Find and fill hidden fields
                const hiddenInputs = document.querySelectorAll('input[name*="captcha"], input[name*="recaptcha"]');
                hiddenInputs.forEach(input => {
                    input.value = token;
                });

            }, response);

            // Wait for page to process response
            await page.waitForTimeout(2000);

            // Try to click continue button
            try {
                const continueButton = await page.locator('button:has-text("Continue")');
                if (await continueButton.isVisible()) {
                    await continueButton.click();
                    this.logger.info('Clicked continue button after captcha');
                    return true;
                }

                const submitButton = await page.locator('button[type="submit"]');
                if (await submitButton.isVisible()) {
                    await submitButton.click();
                    this.logger.info('Clicked submit button after captcha');
                    return true;
                }

            } catch (buttonError) {
                this.logger.warn('Could not find continue/submit button');
            }

            return true;

        } catch (error) {
            this.logger.error('Error submitting captcha response:', error);
            return false;
        }
    }

    // Complete captcha solving workflow
    async handleCaptcha(page) {
        try {
            this.logger.info('Starting captcha handling process');

            // Detect captcha
            const hasCaptcha = await this.detectCaptcha(page);
            if (!hasCaptcha) {
                this.logger.info('No captcha detected');
                return true;
            }

            if (!this.solver) {
                this.logger.warn('No 2captcha solver available, waiting for manual completion');
                this.logger.info('Please complete the captcha manually...');
                await page.waitForTimeout(60000); // Wait 60 seconds
                return true;
            }

            // Get site key and solve captcha
            const siteKey = await this.getSiteKey(page);
            const response = await this.solveCaptcha(page, siteKey);

            if (!response) {
                this.logger.error('Failed to solve captcha');
                return false;
            }

            // Submit captcha response
            const submitted = await this.submitCaptchaResponse(page, response);
            if (!submitted) {
                this.logger.error('Failed to submit captcha response');
                return false;
            }

            // Wait for page response
            await page.waitForTimeout(5000);

            // Check if successful
            const stillHasCaptcha = await this.detectCaptcha(page);
            if (stillHasCaptcha) {
                this.logger.warn('Captcha still present after solving');
                return false;
            }

            this.logger.info('Captcha handled successfully');
            return true;

        } catch (error) {
            this.logger.error('Error handling captcha:', error);
            return false;
        }
    }

    // Get account balance
    async getBalance() {
        if (!this.solver) {
            return null;
        }

        try {
            const balance = await this.solver.balance();
            this.logger.info(`2captcha balance: $${balance}`);
            return balance;
        } catch (error) {
            this.logger.error('Error getting balance:', error);
            return null;
        }
    }
}

module.exports = CaptchaSolver;
