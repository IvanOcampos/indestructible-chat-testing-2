module.exports = {
    testEnvironment: 'node',
    coveragePathIgnorePatterns: ['/node_modules', '/tests'],
    collectCoverageFrom: ['src/**/*.js'],
    coverageThreshold: {
        global: {
            lines: 80,
            functions: 80, // corregido: era "function" y Jest ignoraba el umbral
        },
    },
    testTimeout: 5000,
};
