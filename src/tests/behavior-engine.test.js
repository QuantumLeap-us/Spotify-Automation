const BehaviorEngine = require('../behavior-engine');
const Logger = require('../logger');

// Mock the logger
jest.mock('../logger');
const mockLoggerInstance = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};
Logger.mockImplementation(() => mockLoggerInstance);

describe('BehaviorEngine', () => {
    let behaviorEngine;

    beforeEach(() => {
        // Clear mock calls before each test
        mockLoggerInstance.info.mockClear();
        mockLoggerInstance.error.mockClear();

        behaviorEngine = new BehaviorEngine();
    });

    it('should initialize with default skip patterns and log them', () => {
        expect(behaviorEngine.skipPatterns).toBeDefined();
        expect(behaviorEngine.skipPatterns.short).toEqual({ duration: 40, jitter: 5 });
        expect(behaviorEngine.skipPatterns.medium).toEqual({ duration: 55, jitter: 5 });
        expect(behaviorEngine.skipPatterns.long).toEqual({ duration: 180, jitter: 5 });
        expect(mockLoggerInstance.info).toHaveBeenCalledWith(
            'BehaviorEngine initialized with skip patterns:',
            expect.any(Object) // or specific patterns if needed
        );
    });

    describe('getSkipTime', () => {
        const testPattern = (patternName, baseDuration, jitter) => {
            describe(`Pattern: ${patternName}`, () => {
                it(`should return time within ${baseDuration}s ± ${jitter}s range and log calculation`, () => {
                    const minDurationMs = (baseDuration - jitter) * 1000;
                    const maxDurationMs = (baseDuration + jitter) * 1000;

                    for (let i = 0; i < 100; i++) { // Run multiple times for randomness
                        const skipTimeMs = behaviorEngine.getSkipTime(patternName);
                        expect(skipTimeMs).toBeGreaterThanOrEqual(minDurationMs);
                        expect(skipTimeMs).toBeLessThanOrEqual(maxDurationMs);
                    }

                    // Check if logger was called, at least once for the series of calls
                    // The exact message includes random jitter, so match substring
                    expect(mockLoggerInstance.info).toHaveBeenCalledWith(
                        expect.stringContaining(`Calculated skip time for pattern "${patternName}"`)
                    );
                });
            });
        };

        testPattern('short', 40, 5);
        testPattern('medium', 55, 5);
        testPattern('long', 180, 5);

        it('should handle extremely low base duration with jitter correctly (non-negative result)', () => {
            // Temporarily add a pattern for this test
            behaviorEngine.skipPatterns.extreme = { duration: 1, jitter: 2 }; // 1s ± 2s
            const skipTimeMs = behaviorEngine.getSkipTime('extreme');
            expect(skipTimeMs).toBeGreaterThanOrEqual(0); // Should not be negative
            expect(skipTimeMs).toBeLessThanOrEqual((1 + 2) * 1000); // Max (1+2)*1000 = 3000ms
        });

        it('should throw an error and log for an invalid pattern name', () => {
            const invalidPatternName = 'nonexistent';
            expect(() => {
                behaviorEngine.getSkipTime(invalidPatternName);
            }).toThrow(`Skip pattern "${invalidPatternName}" not found.`);

            expect(mockLoggerInstance.error).toHaveBeenCalledWith(
                `Skip pattern "${invalidPatternName}" not found.`
            );
        });
    });
});
