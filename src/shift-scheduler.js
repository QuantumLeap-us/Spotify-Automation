const cron = require('node-cron');
const Logger = require('./logger');

class ShiftScheduler { // Renamed class
    constructor(spotifyAutomation, sessionManager, configManager) {
        this.logger = new Logger('shift-scheduler'); // Updated logger name
        this.spotifyAutomation = spotifyAutomation;
        this.sessionManager = sessionManager;
        this.configManager = configManager;
        this.shiftsConfig = {}; // Stores shift configurations by name
        this.transitionConfig = { duration_minutes: 30 }; // Default transition config

        // Load maxSessions from automation.yaml or use a default.
        // Assuming configManager.getFullAutomationConfig() exists and works as in previous steps.
        const automationFullConfig = this.configManager?.getFullAutomationConfig ? this.configManager.getFullAutomationConfig() : {};
        this.maxSessions = automationFullConfig?.maxConcurrentSessions || 50;
        this.logger.info(`ShiftScheduler initialized with maxSessions: ${this.maxSessions}.`);
    }

    async initialize() {
        this.logger.info('Initializing ShiftScheduler and loading shift configurations...');
        try {
            // Use the new getScheduleConfig method
            const scheduleYaml = await this.configManager.getScheduleConfig();
            if (scheduleYaml && scheduleYaml.shifts) {
                this.shiftsConfig = scheduleYaml.shifts;
                this.logger.info('Successfully loaded shift configurations from schedule.yaml:', this.shiftsConfig);
                if (scheduleYaml.transition) {
                    this.transitionConfig = { ...this.transitionConfig, ...scheduleYaml.transition };
                    this.logger.info('Loaded transition configuration:', this.transitionConfig);
                }
            } else {
                this.logger.warn('schedule.yaml not found or "shifts" section is missing. Using hardcoded default shifts.');
                this.shiftsConfig = { // Hardcoded defaults based on TECHNICAL_IMPLEMENTATION.md structure
                    morning: { start_hour: 6, end_hour: 12, capacity: 0.3, timezone: "UTC", cronPattern: "0 6 * * *" },
                    afternoon: { start_hour: 12, end_hour: 18, capacity: 1.0, timezone: "UTC", cronPattern: "0 12 * * *" },
                    night: { start_hour: 18, end_hour: 6, capacity: 0.5, timezone: "UTC", cronPattern: "0 18 * * *" },
                };
            }
        } catch (error) {
            this.logger.error('Error loading schedule.yaml, using hardcoded default shifts:', error);
            this.shiftsConfig = { // Fallback hardcoded defaults
                morning: { start_hour: 6, end_hour: 12, capacity: 0.3, timezone: "UTC", cronPattern: "0 6 * * *" },
                afternoon: { start_hour: 12, end_hour: 18, capacity: 1.0, timezone: "UTC", cronPattern: "0 12 * * *" },
                night: { start_hour: 18, end_hour: 6, capacity: 0.5, timezone: "UTC", cronPattern: "0 18 * * *" },
            };
        }
        this.logger.info('ShiftScheduler initialization complete.');
    }

    getCurrentShift(currentTime = new Date()) {
        let currentHour = currentTime.getHours();
        const currentShiftName = Object.keys(this.shiftsConfig).find(shiftName => {
            const shift = this.shiftsConfig[shiftName];
            const { start_hour, end_hour, timezone } = shift;

            if (timezone && timezone.toUpperCase() !== 'UTC' && !(currentTime instanceof Date && currentTime.constructor.name === 'Date')) {
                 // If a non-UTC timezone is specified, and not already using specific date object for test,
                 // true timezone handling is complex. For now, log and use server time.
                 // In a real system, convert currentTime to the shift's timezone before getting hours.
                 // Example: const localizedTime = new Date(currentTime.toLocaleString('en-US', { timeZone: timezone }));
                 // currentHour = localizedTime.getHours();
                 // This basic example doesn't fully implement timezone conversion. It needs a robust library.
                this.logger.warn(`Shift '${shiftName}' has timezone '${timezone}'. Accurate cross-timezone scheduling requires a date/time library. Using server local time for hour comparison.`);
            } else if (timezone && timezone.toUpperCase() === 'UTC') {
                currentHour = currentTime.getUTCHours(); // Use UTC hours if specified
            }
            // else, use local hours from currentTime.getHours() (default)

            if (start_hour <= end_hour) { // Shift does not cross midnight
                return currentHour >= start_hour && currentHour < end_hour;
            } else { // Shift crosses midnight (e.g., 18:00 to 06:00)
                return currentHour >= start_hour || currentHour < end_hour;
            }
        });

        if (currentShiftName) {
            const shiftDetails = this.shiftsConfig[currentShiftName];
            this.logger.debug(`Current shift determined: ${currentShiftName} (${shiftDetails.start_hour}-${shiftDetails.end_hour}, TZ: ${shiftDetails.timezone || 'server'}) for effective hour ${currentHour}`);
            return currentShiftName;
        }

        this.logger.warn(`No matching shift found for effective hour ${currentHour}. Returning default 'night'.`);
        // Attempt to find a default or the first shift if none match explicitly.
        const defaultShift = Object.keys(this.shiftsConfig).find(name => name === 'night') || Object.keys(this.shiftsConfig)[0];
        return defaultShift || 'undefined_fallback';
    }

    getActiveSessionCount() {
        const currentShiftName = this.getCurrentShift();
        const currentShiftConfig = this.shiftsConfig[currentShiftName];

        if (!currentShiftConfig) {
            this.logger.error(`Configuration for current shift '${currentShiftName}' not found. Defaulting to 0 active sessions.`);
            return 0;
        }
        const capacity = currentShiftConfig.capacity;
        const allowedActive = Math.floor(this.maxSessions * capacity);
        this.logger.info(`Current shift: ${currentShiftName}, Capacity: ${capacity*100}%, Max Sessions: ${this.maxSessions}, Allowed Active: ${allowedActive}`);
        return allowedActive;
    }

    shouldStartNewSession() {
        const allowedActive = this.getActiveSessionCount();
        // Assuming SessionManager provides a way to get ONLY operationally active sessions
        const currentActive = this.sessionManager.getSessionStatsSummary().operationallyActiveSessions || 0;
        const shouldStart = currentActive < allowedActive;
        this.logger.info(`Should start new session? Allowed: ${allowedActive}, Current: ${currentActive} -> ${shouldStart}`);
        return shouldStart;
    }

    scheduleShiftTransition(currentTime = new Date()) {
        const currentShiftName = this.getCurrentShift(currentTime);
        const currentShift = this.shiftsConfig[currentShiftName];

        if (!currentShift) {
            this.logger.error(`Cannot schedule transition: Current shift '${currentShiftName}' config not found.`);
            return null;
        }

        // Determine next shift - simplified: assumes shifts are ordered or next is findable
        // This logic needs to be robust, e.g. by sorting shifts by start_hour.
        // For now, a placeholder: find shift whose start_hour is currentShift.end_hour
        let nextShiftName = null;
        let nextShiftStartTime = new Date(currentTime); // Default to avoid issues
        nextShiftStartTime.setHours(currentShift.end_hour, 0, 0, 0);

        if (nextShiftStartTime <= currentTime) { // If end_hour already passed for today, set for tomorrow
            nextShiftStartTime.setDate(nextShiftStartTime.getDate() + 1);
        }

        // Find the shift that starts at nextShiftStartTime's hour
        for (const name in this.shiftsConfig) {
            if (this.shiftsConfig[name].start_hour === nextShiftStartTime.getHours()) {
                nextShiftName = name;
                break;
            }
        }
        if (!nextShiftName) { // Fallback if no direct match (e.g. complex schedule)
             this.logger.warn(`Could not determine next shift directly for ${currentShiftName}. Using a simple fallback.`);
             // Simplified fallback: find any shift that is not the current one. This is very basic.
             const shiftNames = Object.keys(this.shiftsConfig);
             nextShiftName = shiftNames.find(name => name !== currentShiftName) || shiftNames[0];
        }


        const transitionDurationMs = (this.transitionConfig.duration_minutes || 30) * 60 * 1000;
        const transitionStartEpoch = nextShiftStartTime.getTime() - transitionDurationMs;

        const transitionInfo = {
            current: currentShiftName,
            next: nextShiftName,
            transitionStart: new Date(transitionStartEpoch),
            transitionEnd: new Date(nextShiftStartTime) // This is effectively the start time of the next shift
        };
        this.logger.info('Calculated shift transition:', transitionInfo);
        return transitionInfo;
    }

    start() { // Adapted from old start()
        if (Object.keys(this.shiftsConfig).length === 0) {
            this.logger.error('No shifts configured. ShiftScheduler not starting cron jobs.');
            return;
        }
        this.logger.info('Starting ShiftScheduler cron jobs...');

        for (const shiftName in this.shiftsConfig) {
            const shift = this.shiftsConfig[shiftName];
            // The cronPattern should ideally be part of the shift config itself.
            // Example: '0 6 * * *' for 6 AM.
            // If not present, we'd need to construct it from start_hour.
            const cronPattern = shift.cronPattern || `0 ${shift.start_hour} * * *`;

            this.logger.info(`Scheduling job for shift: ${shiftName} at ${cronPattern}`);
            cron.schedule(cronPattern, () => {
                this.logger.info(`Cron triggered for shift change: ${shiftName}. Adjusting capacity.`);
                this.adjustCapacity(); // No percentage needed, it will use getActiveSessionCount
            }, { timezone: shift.timezone || "UTC" });
        }

        // Initial capacity adjustment
        this.logger.info('Performing initial capacity adjustment.');
        this.adjustCapacity();
        this.logger.info('ShiftScheduler started and initial capacity adjusted.');
    }

    adjustCapacity() { // Adapted from old adjustCapacity(percentage)
        const targetSessions = this.getActiveSessionCount(); // Derives target from current shift
        this.logger.info(`Adjusting capacity: Target sessions based on current shift: ${targetSessions} (Max system: ${this.maxSessions})`);

        const currentActiveSessions = this.sessionManager.getSessionStatsSummary().operationallyActiveSessions || 0;
        this.logger.info(`Current active sessions: ${currentActiveSessions}. Target sessions: ${targetSessions}.`);

        const difference = targetSessions - currentActiveSessions;

        if (difference > 0) {
            this.logger.info(`Need to start ${difference} more sessions.`);
            this.spotifyAutomation.runMoreSessions(difference);
        } else if (difference < 0) {
            this.logger.info(`Need to stop ${Math.abs(difference)} sessions.`);
            this.spotifyAutomation.stopSomeSessions(Math.abs(difference));
        } else {
            this.logger.info('Current session count matches target capacity for the current shift. No changes needed.');
        }
    }
    // adjustCapacityBasedOnCurrentTime is effectively replaced by calling adjustCapacity()
    // as adjustCapacity now internally determines the correct capacity.
}

module.exports = ShiftScheduler; // Renamed export
