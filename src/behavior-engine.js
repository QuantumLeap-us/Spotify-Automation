const Logger = require('./logger');

class BehaviorEngine {
    constructor(configManager) {
        this.logger = new Logger('behavior-engine');
        this.configManager = configManager;

        this.loadConfigurations();
        this.logger.info('BehaviorEngine initialized.');
        this.logger.info('Loaded skip patterns:', this.skipPatternsConfig);
        this.logger.info('Loaded pause patterns:', this.pausePatternsConfig);
        this.logger.info('Loaded session lengths:', this.sessionLengthsConfig);
    }

    loadConfigurations() {
        // Use the new getBehaviorConfig method or directly call loadConfig as before
        const behaviorConfig = this.configManager ? this.configManager.getBehaviorConfig() : null;

        if (behaviorConfig) {
            this.logger.info('Successfully loaded behavior.yaml');
            this.skipPatternsConfig = behaviorConfig.skip_patterns;
            this.pausePatternsConfig = behaviorConfig.pause_patterns;
            this.sessionLengthsConfig = behaviorConfig.session_lengths;
        } else {
            this.logger.warn('Behavior configuration (behavior.yaml) not found or ConfigManager not provided. Using default patterns.');
        }

        // Fallback to defaults if specific configs are missing
        if (!this.skipPatternsConfig) {
            this.logger.warn('Skip patterns not found in config, using hardcoded defaults.');
            this.skipPatternsConfig = {
                short: { duration: 40, jitter: 5, weight: 0.4 },
                medium: { duration: 55, jitter: 5, weight: 0.4 },
                long: { duration: 180, jitter: 5, weight: 0.2 },
            };
        }
        if (!this.pausePatternsConfig) {
            this.logger.warn('Pause patterns not found in config, using hardcoded defaults.');
            this.pausePatternsConfig = {
                quick: { min: 1, max: 3, weight: 0.3 },
                normal: { min: 3, max: 8, weight: 0.5 },
                long: { min: 8, max: 15, weight: 0.2 },
            };
        }
        if (!this.sessionLengthsConfig) {
            this.logger.warn('Session lengths not found in config, using hardcoded defaults.');
            this.sessionLengthsConfig = {
                short: { tracks: [1, 3], duration: [60, 180] }, // duration in seconds
                medium: { tracks: [3, 8], duration: [180, 480] },
                long: { tracks: [8, 15], duration: [480, 900] },
            };
        }
    }

    /**
     * Selects an item from a collection based on assigned weights.
     * @param {Object} itemsWithWeights - An object where keys are item names and values are objects
     *                                    containing a 'weight' property. E.g., { itemA: { weight: 10 }, itemB: { weight: 20 } }
     * @returns {string|null} The key/name of the selected item, or null if input is invalid.
     */
    weightedRandomSelect(itemsWithWeights) {
        if (!itemsWithWeights || typeof itemsWithWeights !== 'object' || Object.keys(itemsWithWeights).length === 0) {
            this.logger.warn('weightedRandomSelect: Invalid or empty itemsWithWeights provided.');
            return null;
        }

        let totalWeight = 0;
        for (const key in itemsWithWeights) {
            if (itemsWithWeights[key] && typeof itemsWithWeights[key].weight === 'number' && itemsWithWeights[key].weight > 0) {
                totalWeight += itemsWithWeights[key].weight;
            }
        }

        if (totalWeight <= 0) {
            this.logger.warn('weightedRandomSelect: Total weight is zero or negative, cannot select.');
            // Fallback: return a random key if all weights are 0 or invalid, or the first key.
            const keys = Object.keys(itemsWithWeights);
            return keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : null;
        }

        const randomNumber = Math.random() * totalWeight;
        let cumulativeWeight = 0;

        for (const key in itemsWithWeights) {
            if (itemsWithWeights[key] && typeof itemsWithWeights[key].weight === 'number' && itemsWithWeights[key].weight > 0) {
                cumulativeWeight += itemsWithWeights[key].weight;
                if (randomNumber < cumulativeWeight) {
                    this.logger.debug(`Selected item "${key}" with weight ${itemsWithWeights[key].weight} from total weight ${totalWeight.toFixed(2)}`);
                    return key;
                }
            }
        }
        // Should not be reached if totalWeight > 0 and items have valid weights
        this.logger.error('weightedRandomSelect: Failed to select an item. This should not happen with valid inputs.');
        return null;
    }

    /**
     * Selects a random skip pattern based on configured weights.
     * @returns {Object|null} The selected skip pattern object, or null if no patterns available.
     */
    selectRandomPattern() {
        const patternName = this.weightedRandomSelect(this.skipPatternsConfig);
        if (patternName && this.skipPatternsConfig[patternName]) {
            this.logger.info(`Selected skip pattern: "${patternName}"`);
            return this.skipPatternsConfig[patternName];
        }
        this.logger.error('Could not select a random skip pattern.');
        return null; // Or a default pattern
    }

    /**
     * Generates a natural pause duration in seconds.
     * @returns {number} The calculated pause duration in seconds.
     */
    generateNaturalPause() {
        const pauseTypeName = this.weightedRandomSelect(this.pausePatternsConfig);
        if (pauseTypeName && this.pausePatternsConfig[pauseTypeName]) {
            const pauseConfig = this.pausePatternsConfig[pauseTypeName];
            const { min, max } = pauseConfig;
            const duration = Math.random() * (max - min) + min;
            this.logger.info(`Generated natural pause of type "${pauseTypeName}": ${duration.toFixed(2)} seconds.`);
            return parseFloat(duration.toFixed(2));
        }
        this.logger.warn('Could not generate a natural pause, returning default 0s.');
        return 0; // Default pause if no pattern selected
    }

    /**
     * Generates a skip sequence for a track.
     * @param {number} trackLength - The length of the track in seconds.
     * @returns {Object} An object like { skipAt: number, reason: string, nextAction: string }
     *                   Returns skipAt in seconds.
     */
    generateSkipSequence(trackLength) {
        const pattern = this.selectRandomPattern();
        let patternName = 'default'; // For logging/reason

        if (this.skipPatternsConfig && pattern) {
            // Attempt to find the name of the pattern if possible (this.skipPatternsConfig is {name: patternDetails})
            for (const name in this.skipPatternsConfig) {
                if (this.skipPatternsConfig[name] === pattern) {
                    patternName = name;
                    break;
                }
            }
        }

        if (!pattern) {
            this.logger.warn('No skip pattern selected for generateSkipSequence. Using default behavior (play full).');
            return {
                skipAt: trackLength,
                reason: 'no_pattern_selected_played_full',
                nextAction: 'play_next_track'
            };
        }

        const { duration: baseDuration, jitter: jitterValue } = pattern;
        const randomJitter = (Math.random() * 2 * jitterValue) - jitterValue;
        const calculatedTime = baseDuration + randomJitter;
        const skipTime = Math.max(5, Math.min(trackLength - 5, calculatedTime));

        this.logger.info(`Generated skip sequence for track (${trackLength.toFixed(2)}s): Skip at ${skipTime.toFixed(2)}s. Pattern '${patternName}' base: ${baseDuration}s, Jitter: ${randomJitter.toFixed(2)}s`);

        return {
            skipAt: parseFloat(skipTime.toFixed(2)),
            reason: `pattern_${patternName}_jitter_${randomJitter.toFixed(2)}s`,
            nextAction: 'play_next_track'
        };
    }

    /**
     * Selects a random session length type (e.g., 'short', 'medium', 'long').
     * @returns {Object|null} The selected session length object, or null if config is missing.
     */
    selectRandomSessionLength() {
        if (!this.sessionLengthsConfig || Object.keys(this.sessionLengthsConfig).length === 0) {
            this.logger.warn('Session lengths configuration is missing or empty. Cannot select session length.');
            return null;
        }
        // Assuming session_lengths does not have weights for now, so doing a simple random selection of keys.
        // If weights are added to session_lengths in behavior.yaml, use this.weightedRandomSelect here.
        const lengthNames = Object.keys(this.sessionLengthsConfig);
        const selectedName = lengthNames[Math.floor(Math.random() * lengthNames.length)];
        const selectedLength = this.sessionLengthsConfig[selectedName];

        this.logger.info(`Selected random session length type: "${selectedName}"`, selectedLength);
        return selectedLength;
    }

    /**
     * Generates a behavior profile based on settings.
     * For now, it's a simple pass-through or default.
     * @param {Object} behaviorSettings - Optional settings to customize the profile.
     * @returns {Object} The generated behavior profile.
     */
    generateBehaviorProfile(behaviorSettings) {
        this.logger.info('Generating behavior profile with settings (currently basic implementation):', behaviorSettings);
        const defaultProfile = {
            playStyle: 'standard', // e.g., 'standard', 'shuffle_artist', 'album_oriented'
            interactionLevel: 'medium', // e.g., 'low', 'medium', 'high' (for UI interactions)
            customTrackSelectionLogic: null, // Placeholder for more complex logic
        };
        const profile = {
            ...defaultProfile,
            type: behaviorSettings?.type || 'default_behavior', // From input or default
            ...behaviorSettings // Overwrite defaults with specific settings
        };
        this.logger.debug('Generated behavior profile:', profile);
        return profile;
    }
}

module.exports = BehaviorEngine;
