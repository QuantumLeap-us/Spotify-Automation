const Scheduler = require('../scheduler');
const Logger = require('../logger');
const cron = require('node-cron');

// Mock dependencies
jest.mock('../logger');
jest.mock('node-cron');

// Mock instances for ConfigManager and SpotifyAutomation
const mockConfigManager = {
    loadConfig: jest.fn(),
    // Add any other methods Scheduler uses from ConfigManager
    getFullAutomationConfig: jest.fn().mockReturnValue({ accounts: { length: 10 } }), // default
    getSessionSettings: jest.fn().mockReturnValue({ initial_startup_count: 0 }), // default
};

const mockSpotifyAutomation = {
    config: { accounts: [{email: '1'},{email: '2'},{email: '3'}] }, // Default mock accounts
    runMoreSessions: jest.fn(),
    stopSomeSessions: jest.fn(),
};

const mockSessionManager = {
    getSessionStatsSummary: jest.fn().mockReturnValue({ operationallyActiveSessions: 0 }), // Default
};

const mockLoggerInstance = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};
Logger.mockImplementation(() => mockLoggerInstance);

describe('Scheduler', () => {
    let scheduler;
    let cronScheduledJobs = []; // To store cron.schedule arguments

    beforeEach(() => {
        // Reset mocks
        mockLoggerInstance.info.mockClear();
        mockLoggerInstance.error.mockClear();
        mockLoggerInstance.warn.mockClear();
        mockConfigManager.loadConfig.mockReset();
        mockSpotifyAutomation.runMoreSessions.mockClear();
        mockSpotifyAutomation.stopSomeSessions.mockClear();
        mockSessionManager.getSessionStatsSummary.mockReturnValue({ operationallyActiveSessions: 0 }); // Reset to default

        // Mock cron.schedule to capture job details instead of actually scheduling
        cronScheduledJobs = [];
        cron.schedule.mockImplementation((pattern, func, options) => {
            cronScheduledJobs.push({ pattern, func, options });
            return { // Return a mock task object
                start: jest.fn(),
                stop: jest.fn(),
            };
        });

        // Default config mock
        mockConfigManager.loadConfig.mockResolvedValue(null); // Default to no schedule.yaml

        scheduler = new Scheduler(mockSpotifyAutomation, mockSessionManager, mockConfigManager);
        // Manually set totalCapacity for tests if not set by spotifyAutomation.config.accounts.length in constructor
        scheduler.totalCapacity = mockSpotifyAutomation.config.accounts.length;
    });

    describe('Constructor and Initialization', () => {
        it('should initialize with hardcoded shifts if schedule.yaml is not found or empty', async () => {
            mockConfigManager.loadConfig.mockResolvedValueOnce(null);
            await scheduler.initialize(); // Call initialize as it loads config
            expect(scheduler.shifts).toEqual(scheduler.hardcodedShifts);
            expect(mockLoggerInstance.warn).toHaveBeenCalledWith('schedule.yaml not found or empty. Using hardcoded shifts.');
        });

        it('should load shifts from configManager if schedule.yaml provides them', async () => {
            const customShifts = [{ name: 'Test Shift', cronStartTime: '0 1 * * *', capacityPercentage: 25 }];
            mockConfigManager.loadConfig.mockResolvedValueOnce({ shifts: customShifts });
            await scheduler.initialize();
            expect(scheduler.shifts).toEqual(customShifts);
            expect(mockLoggerInstance.info).toHaveBeenCalledWith('Successfully loaded schedules from config/schedule.yaml');
        });

        it('should set totalCapacity based on spotifyAutomation.config.accounts', async () => {
            mockSpotifyAutomation.config.accounts = [{}, {}, {}, {}, {}]; // 5 accounts
            scheduler = new Scheduler(mockSpotifyAutomation, mockSessionManager, mockConfigManager); // Re-instantiate
            await scheduler.initialize();
            expect(scheduler.totalCapacity).toBe(5);
            expect(mockLoggerInstance.info).toHaveBeenCalledWith('Total system capacity set to 5 sessions.');
        });

        it('should default totalCapacity if spotifyAutomation config is not as expected', async () => {
            const tempSpotifyAutomation = { ...mockSpotifyAutomation, config: {} }; // No accounts array
            scheduler = new Scheduler(tempSpotifyAutomation, mockSessionManager, mockConfigManager);
            await scheduler.initialize();
            expect(scheduler.totalCapacity).toBe(10); // The default value set in Scheduler
            expect(mockLoggerInstance.warn).toHaveBeenCalledWith('Could not determine total capacity from spotifyAutomation config. Defaulting to 10.');
        });
    });

    describe('Starting Scheduler', () => {
        beforeEach(async () => {
            // Ensure shifts are loaded (using hardcoded for predictability)
            mockConfigManager.loadConfig.mockResolvedValueOnce(null); // Use hardcoded
            await scheduler.initialize();
        });

        it('should schedule cron jobs for each shift and adjust capacity on start', () => {
            // Spy on adjustCapacityBasedOnCurrentTime to ensure it's called
            const adjustCapacitySpy = jest.spyOn(scheduler, 'adjustCapacityBasedOnCurrentTime');
            scheduler.start();

            expect(cron.schedule).toHaveBeenCalledTimes(scheduler.shifts.length);
            scheduler.shifts.forEach((shift, index) => {
                expect(cronScheduledJobs[index].pattern).toBe(shift.cronStartTime);
            });
            expect(mockLoggerInstance.info).toHaveBeenCalledWith('Starting scheduler and setting up cron jobs for shifts...');
            expect(adjustCapacitySpy).toHaveBeenCalled();
            adjustCapacitySpy.mockRestore();
        });

        it('should not start if no shifts are defined', () => {
            scheduler.shifts = []; // Override to empty
            scheduler.start();
            expect(cron.schedule).not.toHaveBeenCalled();
            expect(mockLoggerInstance.error).toHaveBeenCalledWith('No shifts defined. Scheduler not starting.');
        });
    });

    describe('Capacity Adjustment Logic', () => {
        let originalSpotifyAutomationConfig;

        beforeEach(async () => {
            // Modify mockSpotifyAutomation for this specific describe block
            // to ensure totalCapacity becomes 10 after initialize()
            originalSpotifyAutomationConfig = mockSpotifyAutomation.config;
            mockSpotifyAutomation.config = { accounts: new Array(10).fill({}) }; // Ensure .length is 10

            await scheduler.initialize(); // This will now set scheduler.totalCapacity to 10

            // Verify totalCapacity is indeed 10 for these tests
            expect(scheduler.totalCapacity).toBe(10);
        });

        afterEach(() => {
            // Restore original config for other tests
            mockSpotifyAutomation.config = originalSpotifyAutomationConfig;
        });

        it('should call runMoreSessions if target is higher than current', () => {
            mockSessionManager.getSessionStatsSummary.mockReturnValue({ operationallyActiveSessions: 2 });
            scheduler.adjustCapacity(50); // 50% of 10 = 5 target
            expect(mockSpotifyAutomation.runMoreSessions).toHaveBeenCalledWith(3); // Need 3 more (5 - 2)
            expect(mockLoggerInstance.info).toHaveBeenCalledWith('Need to start 3 more sessions.');
        });

        it('should call stopSomeSessions if target is lower than current', () => {
            mockSessionManager.getSessionStatsSummary.mockReturnValue({ operationallyActiveSessions: 8 });
            scheduler.adjustCapacity(30); // 30% of 10 = 3 target
            expect(mockSpotifyAutomation.stopSomeSessions).toHaveBeenCalledWith(5); // Need to stop 5 (8 - 3)
            expect(mockLoggerInstance.info).toHaveBeenCalledWith('Need to stop 5 sessions.');
        });

        it('should do nothing if target matches current capacity', () => {
            mockSessionManager.getSessionStatsSummary.mockReturnValue({ operationallyActiveSessions: 5 });
            scheduler.adjustCapacity(50); // 50% of 10 = 5 target
            expect(mockSpotifyAutomation.runMoreSessions).not.toHaveBeenCalled();
            expect(mockSpotifyAutomation.stopSomeSessions).not.toHaveBeenCalled();
            expect(mockLoggerInstance.info).toHaveBeenCalledWith('Current session count matches target capacity. No changes needed.');
        });
    });

    describe('adjustCapacityBasedOnCurrentTime', () => {
        beforeEach(async () => {
            // Use hardcoded shifts for predictability
            mockConfigManager.loadConfig.mockResolvedValueOnce(null);
            await scheduler.initialize();
            scheduler.totalCapacity = 100; // e.g. 100 accounts
        });

        const testCases = [
            { hour: 3, expectedShiftName: 'Night Window', expectedCapacityPercentage: 50 }, // Early morning (Night)
            { hour: 8, expectedShiftName: 'AM Window', expectedCapacityPercentage: 30 },    // Morning (AM)
            { hour: 14, expectedShiftName: 'PM Window', expectedCapacityPercentage: 100 },  // Afternoon (PM)
            { hour: 20, expectedShiftName: 'Night Window', expectedCapacityPercentage: 50 }  // Evening (Night)
        ];

        testCases.forEach(({ hour, expectedShiftName, expectedCapacityPercentage }) => {
            it(`should apply ${expectedCapacityPercentage}% for ${expectedShiftName} at ${hour}:00`, () => {
                jest.useFakeTimers().setSystemTime(new Date(2023, 10, 20, hour, 0, 0)); // Month is 0-indexed

                const adjustCapacitySpy = jest.spyOn(scheduler, 'adjustCapacity');
                scheduler.adjustCapacityBasedOnCurrentTime();

                expect(mockLoggerInstance.info).toHaveBeenCalledWith(
                    `Current time is within '${expectedShiftName}'. Adjusting to its capacity: ${expectedCapacityPercentage}%.`
                );
                expect(adjustCapacitySpy).toHaveBeenCalledWith(expectedCapacityPercentage);

                adjustCapacitySpy.mockRestore();
                jest.useRealTimers();
            });
        });

        it('should trigger the correct shift adjustment when a cron job function is called', () => {
            scheduler.start(); // This populates cronScheduledJobs

            // Find the PM Window job (100% capacity)
            const pmShiftJob = cronScheduledJobs.find(job => job.pattern === '0 12 * * *');
            expect(pmShiftJob).toBeDefined();

            const adjustCapacitySpy = jest.spyOn(scheduler, 'adjustCapacity');

            // Simulate the cron job firing for PM shift
            pmShiftJob.func();

            expect(mockLoggerInstance.info).toHaveBeenCalledWith(
                "Shift 'PM Window' starting. Adjusting capacity to 100%."
            );
            expect(adjustCapacitySpy).toHaveBeenCalledWith(100);
            adjustCapacitySpy.mockRestore();
        });
    });
});
