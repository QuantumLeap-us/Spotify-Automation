const fs = require('fs');
const path = require('path');
const SessionManager = require('../session-manager');
const Logger = require('../logger'); // Actual Logger

// Mock dependencies
jest.mock('fs');
jest.mock('../logger'); // Mock our custom logger to spy on its methods or suppress output

const mockLoggerInstance = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
};
Logger.mockImplementation(() => mockLoggerInstance);


describe('SessionManager', () => {
    let sessionManager;
    const mockSessionsDir = path.join(__dirname, '../../sessions'); // Adjusted path

    beforeEach(() => {
        // Reset mocks before each test
        fs.existsSync.mockReset();
        fs.mkdirSync.mockReset();
        fs.writeFileSync.mockReset();
        fs.readFileSync.mockReset();
        fs.readdirSync.mockReset();
        fs.unlinkSync.mockReset();
        fs.statSync.mockReset();

        mockLoggerInstance.info.mockClear();
        mockLoggerInstance.error.mockClear();
        mockLoggerInstance.warn.mockClear();
        mockLoggerInstance.debug.mockClear();

        // Default mock implementations
        fs.existsSync.mockReturnValue(true); // Assume sessions dir exists by default
        fs.readdirSync.mockReturnValue([]); // Default to no files

        sessionManager = new SessionManager();
        // Override sessionsDir for testing to ensure it's correct
        sessionManager.sessionsDir = mockSessionsDir;
    });

    describe('Constructor', () => {
        it('should create sessions directory if it does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            new SessionManager(); // Call constructor again with dir not existing
            expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('sessions'), { recursive: true });
        });

        it('should not attempt to create sessions directory if it exists', () => {
            fs.existsSync.mockReturnValue(true);
            new SessionManager();
            expect(fs.mkdirSync).not.toHaveBeenCalled();
        });
    });

    describe('Session Creation and Management', () => {
        const mockAccount = { email: 'test@example.com', username: 'testuser' };
        const mockProxy = { host: 'proxy.example.com', port: 8080 };

        it('should create a new session with initializing status', () => {
            const sessionId = sessionManager.createSession(mockAccount, mockProxy);
            const session = sessionManager.getSession(sessionId);

            expect(session).toBeDefined();
            expect(session.id).toEqual(sessionId);
            expect(session.account).toEqual(mockAccount);
            expect(session.proxy).toEqual(mockProxy);
            expect(session.status).toBe('initializing');
            expect(session.startTime).toBeInstanceOf(Date);
            expect(session.stats).toEqual(expect.objectContaining({
                successfulStreams: 0,
                failedStreams: 0,
                totalPlaytime: 0,
                loginAttempts: 0,
                errors: []
            }));
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                path.join(mockSessionsDir, `${sessionId}.json`),
                expect.any(String)
            );
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(expect.stringContaining(`Created session ${sessionId}`));
        });

        it('should update session status and log the change with reason', () => {
            const sessionId = sessionManager.createSession(mockAccount);
            const newStatus = 'running';
            const reason = 'Test update';
            sessionManager.updateSessionStatus(sessionId, newStatus, reason, { customDetail: 'detail' });
            const session = sessionManager.getSession(sessionId);

            expect(session.status).toBe(newStatus);
            expect(session.lastUpdate).toBeInstanceOf(Date);
            expect(session.customDetail).toBe('detail');
            expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // Create + Update
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(
                expect.stringContaining(`Session ${sessionId} status updated from initializing to: ${newStatus} - Reason: ${reason}`)
            );
        });

        it('should handle heartbeat for a session', () => {
            const sessionId = sessionManager.createSession(mockAccount);
            sessionManager.heartbeat(sessionId);
            const session = sessionManager.getSession(sessionId);
            expect(session.lastHeartbeat).toBeInstanceOf(Date);
            expect(fs.writeFileSync).toHaveBeenCalledTimes(2); // Create + Heartbeat save
            expect(mockLoggerInstance.debug).toHaveBeenCalledWith(`Heartbeat received for session ${sessionId}`);
        });

        it('should warn on heartbeat for an unknown session', () => {
            sessionManager.heartbeat('unknown_session');
            expect(mockLoggerInstance.warn).toHaveBeenCalledWith('Heartbeat received for unknown or inactive session unknown_session');
        });
    });

    describe('Session Errors', () => {
        const mockAccount = { email: 'error@example.com' };

        it('should add an error to a session and log it', () => {
            const sessionId = sessionManager.createSession(mockAccount);
            const error = new Error('Test error');
            const activity = 'testing errors';
            sessionManager.addSessionError(sessionId, error, activity, false);

            const session = sessionManager.getSession(sessionId);
            expect(session.stats.errors.length).toBe(1);
            expect(session.stats.errors[0].message).toBe('Test error');
            expect(session.stats.errors[0].activity).toBe(activity);
            expect(mockLoggerInstance.error).toHaveBeenCalledWith(
                `Session ${sessionId} error during ${activity}: Test error`,
                error.stack
            );
        });

        it('should set session status to "failed" if error is critical', () => {
            const sessionId = sessionManager.createSession(mockAccount);
            const error = new Error('Critical failure');
            const activity = 'critical testing';
            sessionManager.addSessionError(sessionId, error, activity, true);

            const session = sessionManager.getSession(sessionId);
            expect(session.status).toBe('failed');
            expect(mockLoggerInstance.warn).toHaveBeenCalledWith(
                `Critical error in session ${sessionId}, setting status to 'failed'.`
            );
            expect(mockLoggerInstance.info).toHaveBeenCalledWith( // This comes from updateSessionStatus
                 expect.stringContaining(`Session ${sessionId} status updated from initializing to: failed - Reason: Critical error during ${activity}: Critical failure`)
            );
        });
    });

    describe('Session Cleanup', () => {
        const mockAccount = { email: 'cleanup@example.com' };

        it('should cleanup session, set final status, and remove from active sessions', () => {
            const sessionId = sessionManager.createSession(mockAccount);
            // Manually set startTime to a specific Date object for consistent duration calculation
            const startTime = new Date(Date.now() - 10000); // 10 seconds ago
            sessionManager.activeSessions.get(sessionId).startTime = startTime;

            sessionManager.cleanupSession(sessionId, 'completed', 'Test cleanup');

            const session = sessionManager.getSession(sessionId); // Should be undefined from active map
            expect(session).toBeUndefined();

            // Verify saveSessionData was called with correct final details
            const expectedFilePath = path.join(mockSessionsDir, `${sessionId}.json`);
            // The last call to writeFileSync for this session ID should be the cleanup call
            const lastWriteCallArgs = fs.writeFileSync.mock.calls.filter(call => call[0] === expectedFilePath).pop();
            expect(lastWriteCallArgs).toBeDefined();

            const savedData = JSON.parse(lastWriteCallArgs[1]);
            expect(savedData.status).toBe('completed');
            expect(savedData.endTime).toBeDefined();
            expect(savedData.duration).toBeGreaterThanOrEqual(10000); // Duration should be ~10000ms
            expect(savedData.duration).toBeLessThan(11000); // Allow for slight timing variations

            expect(mockLoggerInstance.info).toHaveBeenCalledWith(expect.stringContaining(`Starting cleanup for session ${sessionId}`));
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(expect.stringContaining(`Placeholder: Perform actual resource cleanup for session ${sessionId}`));
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(expect.stringContaining(`Session ${sessionId} removed from active sessions.`));
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(expect.stringContaining(`Finished cleanup for session ${sessionId}. Final status: completed.`));
        });
    });

    describe('Session Statistics Summary', () => {
        beforeEach(() => {
            // Clear active sessions map for clean summary tests
            sessionManager.activeSessions.clear();
        });

        it('should correctly summarize stats from loaded session files and active sessions', () => {
            const session1Data = { id: 's1', status: 'running', startTime: new Date(), stats: { successfulStreams: 1, failedStreams: 0, totalPlaytime: 100, errors: [] } };
            const session2Data = { id: 's2', status: 'completed', startTime: new Date(), endTime: new Date(), duration: 120, stats: { successfulStreams: 2, failedStreams: 1, totalPlaytime: 200, errors: [] } };
            const session3Data = { id: 's3', status: 'failed', startTime: new Date(), stats: { successfulStreams: 0, failedStreams: 0, totalPlaytime: 10, errors: [{ message: "err"}] } };
            const session4ActiveData = { id: 's4', status: 'initializing', account: {}, proxy: {}, startTime: new Date(), stats: { successfulStreams: 0, failedStreams: 0, totalPlaytime: 0, errors: [] } };

            // Mock fs.readdirSync to return a list of session files
            fs.readdirSync.mockReturnValue(['s1.json', 's2.json', 's3.json', 's4_cookies.json']);

            // Mock fs.readFileSync for each session file
            // Note: loadSessionData is called by getSessionStatsSummary
            fs.readFileSync.mockImplementation(filePath => {
                if (filePath.endsWith('s1.json')) return JSON.stringify(session1Data);
                if (filePath.endsWith('s2.json')) return JSON.stringify(session2Data);
                if (filePath.endsWith('s3.json')) return JSON.stringify(session3Data);
                return null; // Should not try to load s4_cookies.json as a session
            });

            // Add one session as "active" in memory
            sessionManager.activeSessions.set(session4ActiveData.id, session4ActiveData);
            // Update s1 to be active as well, to test merging/overwriting logic
            const updatedS1Data = { ...session1Data, status: 'idle', lastHeartbeat: new Date() };
            sessionManager.activeSessions.set(updatedS1Data.id, updatedS1Data);

            const summary = sessionManager.getSessionStatsSummary();

            expect(summary.totalTrackedSessions).toBe(4); // s1, s2, s3 from files, s4 from active (s1 active overwrites file)
            expect(summary.runningSessions).toBe(0); // s1 is now idle
            expect(summary.idleSessions).toBe(1); // s1 updated to idle
            expect(summary.initializingSessions).toBe(1); // s4
            expect(summary.completedSessions).toBe(1); // s2
            expect(summary.failedSessions).toBe(1); // s3
            expect(summary.operationallyActiveSessions).toBe(2); // s1 (idle) + s4 (initializing)
            expect(summary.totalSuccessfulStreams).toBe(1 + 2 + 0); // s1 + s2 + s3
            expect(summary.totalFailedStreams).toBe(0 + 1 + 0);
            expect(summary.totalPlaytime).toBe(100 + 200 + 10);
        });
    });

    describe('Cookie Management', () => {
        const sessionId = 'cookieSession';
        const cookies = [{ name: 'cookie1', value: 'value1' }];

        it('should save cookies to a file', async () => {
            await sessionManager.saveCookies(sessionId, cookies);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                path.join(mockSessionsDir, `${sessionId}_cookies.json`),
                JSON.stringify(cookies, null, 2)
            );
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Saved cookies for session ${sessionId}`);
        });

        it('should load cookies from a file', async () => {
            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue(JSON.stringify(cookies));

            const loadedCookies = await sessionManager.loadCookies(sessionId);
            expect(loadedCookies).toEqual(cookies);
            expect(fs.readFileSync).toHaveBeenCalledWith(
                path.join(mockSessionsDir, `${sessionId}_cookies.json`),
                'utf8'
            );
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Loaded cookies for session ${sessionId}`);
        });

        it('should return null if cookie file does not exist', async () => {
            fs.existsSync.mockReturnValue(false);
            const loadedCookies = await sessionManager.loadCookies(sessionId);
            expect(loadedCookies).toBeNull();
        });
    });

    describe('Old Session File Cleaning', () => {
        it('should delete session files older than maxAge', () => {
            const now = Date.now();
            const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

            const oldFile = 'old_session.json';
            const newFile = 'new_session.json';
            const oldCookieFile = 'old_session_cookies.json';

            fs.readdirSync.mockReturnValue([oldFile, newFile, oldCookieFile]);

            fs.statSync.mockImplementation(filePath => {
                if (filePath.endsWith(oldFile) || filePath.endsWith(oldCookieFile)) {
                    return { mtime: new Date(now - maxAge - 1000) }; // Older than maxAge
                }
                if (filePath.endsWith(newFile)) {
                    return { mtime: new Date(now - 1000) }; // Newer
                }
                return {mtime: new Date()};
            });

            // Mock Date.now() for consistent results if cleanOldSessions uses it directly, though it doesn't seem to.
            // jest.spyOn(Date, 'now').mockReturnValue(now);

            sessionManager.cleanOldSessions(maxAge);

            expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockSessionsDir, oldFile));
            expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(mockSessionsDir, oldCookieFile));
            expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(mockSessionsDir, newFile));
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Cleaned old session file: ${oldFile}`);
            expect(mockLoggerInstance.info).toHaveBeenCalledWith(`Cleaned old session file: ${oldCookieFile}`);

            // Date.now.mockRestore(); // if Date.now was spied upon
        });
    });
});
