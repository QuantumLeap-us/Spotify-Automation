const cron = require('node-cron');
const Logger = require('./logger');

class Scheduler {
    constructor(spotifyAutomation, sessionManager, configManager) {
        this.logger = new Logger('scheduler');
        this.spotifyAutomation = spotifyAutomation; // Instance of SpotifyAutomation to call start/stop methods
        this.sessionManager = sessionManager;
        this.configManager = configManager;
        this.shifts = [];
        this.totalCapacity = 0; // Max number of accounts/sessions available

        // Load schedules - for now, hardcoded as per PROJECT_SPECIFICATION.md
        // Later, this will come from configManager.loadConfig('schedule.yaml')
        this.hardcodedShifts = [
            { name: 'AM Window', cronStartTime: '0 6 * * *', cronEndTime: '0 12 * * *', capacityPercentage: 30 },
            { name: 'PM Window', cronStartTime: '0 12 * * *', cronEndTime: '0 18 * * *', capacityPercentage: 100 },
            { name: 'Night Window', cronStartTime: '0 18 * * *', cronEndTime: '0 6 * * *', capacityPercentage: 50 }
        ];
        this.logger.info('Scheduler initialized.');
    }

    async initialize() {
        // In a real scenario, totalCapacity would be based on available accounts or a system-wide setting.
        // For now, let's assume it's fetched from the main config or based on the number of accounts.
        // This needs to be set before shifts are processed.
        // Let's say, for the purpose of this example, totalCapacity is fetched from spotifyAutomation's config
        if (this.spotifyAutomation && this.spotifyAutomation.config && this.spotifyAutomation.config.accounts) {
            this.totalCapacity = this.spotifyAutomation.config.accounts.length;
        } else {
            this.logger.warn('Could not determine total capacity from spotifyAutomation config. Defaulting to 10.');
            this.totalCapacity = 10; // Default if not found
        }
        this.logger.info(`Total system capacity set to ${this.totalCapacity} sessions.`);

        // Attempt to load schedules from config file if available
        try {
            const scheduleConfig = await this.configManager.loadConfig('schedule.yaml');
            if (scheduleConfig && scheduleConfig.shifts && scheduleConfig.shifts.length > 0) {
                this.shifts = scheduleConfig.shifts.map(shift => ({
                    ...shift,
                    // cronEndTime might not be directly in YAML, calculate or handle if needed
                }));
                this.logger.info('Successfully loaded schedules from config/schedule.yaml');
            } else {
                this.logger.warn('schedule.yaml not found or empty. Using hardcoded shifts.');
                this.shifts = this.hardcodedShifts;
            }
        } catch (error) {
            this.logger.error('Error loading schedule.yaml, using hardcoded shifts:', error);
            this.shifts = this.hardcodedShifts;
        }
    }

    start() {
        if (!this.shifts || this.shifts.length === 0) {
            this.logger.error('No shifts defined. Scheduler not starting.');
            return;
        }
        this.logger.info('Starting scheduler and setting up cron jobs for shifts...');

        this.shifts.forEach(shift => {
            this.logger.info(`Scheduling shift: ${shift.name} to start at ${shift.cronStartTime} with ${shift.capacityPercentage}% capacity.`);

            cron.schedule(shift.cronStartTime, () => {
                this.logger.info(`Shift '${shift.name}' starting. Adjusting capacity to ${shift.capacityPercentage}%.`);
                this.adjustCapacity(shift.capacityPercentage);
            });

            // Note: For shifts that cross midnight (like Night Window ending at 6 AM),
            // the start cron alone is often enough if the next shift correctly adjusts capacity.
            // If explicit stop times are needed for each shift (e.g. to go to 0 capacity if no shift follows),
            // then cronEndTime would be used. The current hardcoded example implies continuous operation
            // with varying capacity.
            if (shift.cronEndTime) {
                 this.logger.info(`Shift: ${shift.name} scheduled to end at ${shift.cronEndTime}. Capacity will be adjusted by the next shift.`);
                // Example: If a shift needs to explicitly stop sessions:
                // cron.schedule(shift.cronEndTime, () => {
                //    this.logger.info(`Shift '${shift.name}' ending. Adjusting capacity or stopping all sessions if it's the end of operations.`);
                //    // Logic here might be to transition to a default capacity or stop specific sessions.
                //    // For now, we assume the next shift's start will handle the new capacity.
                // });
            }
        });

        // Initial capacity adjustment based on current time
        this.adjustCapacityBasedOnCurrentTime();
        this.logger.info('Scheduler started. Initial capacity adjusted based on current time.');
    }

    adjustCapacity(percentage) {
        const targetSessions = Math.floor((percentage / 100) * this.totalCapacity);
        this.logger.info(`Adjusting capacity: Target ${percentage}% (${targetSessions} sessions out of ${this.totalCapacity}).`);

        const currentActiveSessions = this.sessionManager.getSessionStatsSummary().operationallyActiveSessions || 0;
        this.logger.info(`Current active sessions: ${currentActiveSessions}. Target sessions: ${targetSessions}.`);

        const difference = targetSessions - currentActiveSessions;

        if (difference > 0) {
            this.logger.info(`Need to start ${difference} more sessions.`);
            this.spotifyAutomation.runMoreSessions(difference); // Method to be implemented in SpotifyAutomation
        } else if (difference < 0) {
            this.logger.info(`Need to stop ${Math.abs(difference)} sessions.`);
            this.spotifyAutomation.stopSomeSessions(Math.abs(difference)); // Method to be implemented in SpotifyAutomation
        } else {
            this.logger.info('Current session count matches target capacity. No changes needed.');
        }
    }

    adjustCapacityBasedOnCurrentTime() {
        const now = new Date();
        const currentHour = now.getHours();
        let activeShift = null;

        // Determine which hardcoded shift is currently active
        // This logic assumes shifts are contiguous and cover 24 hours.
        // AM: 06:00 - 11:59 (JS getHours() is 0-23)
        if (currentHour >= 6 && currentHour < 12) {
            activeShift = this.shifts.find(s => s.name === 'AM Window');
        }
        // PM: 12:00 - 17:59
        else if (currentHour >= 12 && currentHour < 18) {
            activeShift = this.shifts.find(s => s.name === 'PM Window');
        }
        // Night: 18:00 - 05:59 (covers evening and early morning)
        else { // Covers 18:00 to 23:59 and 00:00 to 05:59
            activeShift = this.shifts.find(s => s.name === 'Night Window');
        }

        if (activeShift) {
            this.logger.info(`Current time is within '${activeShift.name}'. Adjusting to its capacity: ${activeShift.capacityPercentage}%.`);
            this.adjustCapacity(activeShift.capacityPercentage);
        } else {
            // Fallback or default capacity if no shift matches (should ideally not happen with 24/7 shifts)
            this.logger.warn('No specific shift active at current time. Applying default 0% capacity or maintaining current.');
            // this.adjustCapacity(0); // Or some other default. For now, let's not change.
        }
    }


    // These methods are illustrative of how Scheduler might interact with SpotifyAutomation
    // The actual session starting/stopping logic resides in SpotifyAutomation.
    // startSessions(count) {
    //     this.logger.info(`Scheduler requesting to start ${count} sessions.`);
    //     if (this.spotifyAutomation && typeof this.spotifyAutomation.runMoreSessions === 'function') {
    //         this.spotifyAutomation.runMoreSessions(count);
    //     } else {
    //         this.logger.error('SpotifyAutomation instance or runMoreSessions method not available.');
    //     }
    // }

    // stopSessions(count) {
    //     this.logger.info(`Scheduler requesting to stop ${count} sessions.`);
    //     if (this.spotifyAutomation && typeof this.spotifyAutomation.stopSomeSessions === 'function') {
    //         this.spotifyAutomation.stopSomeSessions(count);
    //     } else {
    //         this.logger.error('SpotifyAutomation instance or stopSomeSessions method not available.');
    //     }
    // }
}

module.exports = Scheduler;
