export default {
  testEnvironment: 'node',
  // Jest otherwise uses watchman when installed, which hangs when it cannot access the folder
  watchman: false,
  // Native ES modules: no Babel transform (tests run with --experimental-vm-modules)
  transform: {},
  coverageProvider: 'v8',
  collectCoverageFrom: ['src/**/*.js', '!src/server.js'],
  coverageThreshold: {
    global: { lines: 60, statements: 60 },
  },
};
