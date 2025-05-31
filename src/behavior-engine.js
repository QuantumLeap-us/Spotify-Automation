const Logger = require('./logger');

class BehaviorEngine {
    constructor() {
        this.logger = new Logger('behavior-engine');
        this.skipPatterns = {
            short: { duration: 40, jitter: 5 },    // seconds
            medium: { duration: 55, jitter: 5 },   // seconds
            long: { duration: 180, jitter: 5 },   // seconds
            // Future: xlong: { duration: 300, jitter: 30 }
        };
        this.logger.info('BehaviorEngine initialized with skip patterns:', this.skipPatterns);
    }

    /**
     * Calculates a skip time based on a pattern name.
     * @param {string} patternName - The name of the skip pattern (e.g., "short", "medium", "long").
     * @returns {number} The calculated skip time in milliseconds.
     * @throws {Error} If the patternName is not found.
     */
    getSkipTime(patternName) {
        const pattern = this.skipPatterns[patternName];
        if (!pattern) {
            this.logger.error(`Skip pattern "${patternName}" not found.`);
            throw new Error(`Skip pattern "${patternName}" not found.`);
        }

        const { duration, jitter } = pattern;
        // Calculate jitter: a random value between -jitter and +jitter
        const randomJitter = (Math.random() * 2 * jitter) - jitter;
        const calculatedDurationInSeconds = duration + randomJitter;

        // Ensure duration is not negative, though with typical positive durations and smaller jitters, this is unlikely.
        const finalDurationInSeconds = Math.max(0, calculatedDurationInSeconds);
        const skipTimeInMilliseconds = Math.round(finalDurationInSeconds * 1000);

        this.logger.info(`Calculated skip time for pattern "${patternName}": ${finalDurationInSeconds.toFixed(2)}s (${skipTimeInMilliseconds}ms). Base: ${duration}s, Jitter: ${randomJitter.toFixed(2)}s`);
        return skipTimeInMilliseconds;
    }
}

module.exports = BehaviorEngine;
