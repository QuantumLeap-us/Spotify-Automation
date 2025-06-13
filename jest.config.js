// jest.config.js
module.exports = {
  // Automatically clear mock calls and instances between every test
  clearMocks: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    "/node_modules/"
  ],

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The test environment that will be used for testing
  testEnvironment: "node",

  // A map from regular expressions to paths to transformers
  // transform: {},

  // An array of regexp pattern strings that are matched against all test paths before executing the test
  testPathIgnorePatterns: [
    "/node_modules/",
    "/archive/" // Assuming 'archive' contains old/unused code
  ],

  // Indicates whether each individual test should be reported during the run
  verbose: true,

  // A list of paths to modules that run some code to configure or set up the testing framework before each test
  // setupFilesAfterEnv: ['./jest.setup.js'], // if you have a setup file

  // Specify module file extensions
  moduleFileExtensions: ['js', 'json', 'jsx', 'ts', 'tsx', 'node'],

  // Define testMatch patterns if your tests are not in __tests__ folders or don't have .test.js / .spec.js extensions
  // testMatch: [
  //   "**/tests/**/*.test.js?(x)", // Look for .test.js or .test.jsx in any 'tests' subfolder
  //   "**/__tests__/**/*.js?(x)",
  // ],

  // Mock static assets to prevent errors during tests
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|eot|otf|webp|svg|ttf|woff|woff2|mp4|webm|wav|mp3|m4a|aac|oga)$": "<rootDir>/__mocks__/fileMock.js",
    "\\.(css|less|scss|sass)$": "<rootDir>/__mocks__/styleMock.js"
  },
};

// Create dummy mock files if they don't exist, to prevent Jest from complaining.
// __mocks__/fileMock.js
// module.exports = 'test-file-stub';

// __mocks__/styleMock.js
// module.exports = {};
