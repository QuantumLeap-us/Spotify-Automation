// __mocks__/node-cron.js

const cron = {
  schedule: jest.fn((cronTime, func, options) => {
    // Store the scheduled job details if needed for assertions
    // This mock is primarily to allow the module to be imported and cron.schedule to be called.
    // In scheduler.test.js, we are already overriding this mockImplementation
    // to capture jobs in the `cronScheduledJobs` array.
    return {
      start: jest.fn(),
      stop: jest.fn(),
      // Add any other methods of a cron job object your code might use
    };
  }),
  validate: jest.fn(cronTime => {
    // Basic validation mock: assume valid if it's a non-empty string
    return typeof cronTime === 'string' && cronTime.length > 0;
  }),
  // Add any other functions exported by node-cron that your SUT might use
};

module.exports = cron;
