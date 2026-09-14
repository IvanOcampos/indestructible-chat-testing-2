const { WebSocketServer } = require('ws');

function createTestServer() {
    return new Promise((resolve) => {
        const wss = new WebSocketServer({ port: 0 });
        wss.on('listening', () => {
            const { port } = wss.address();
            resolve({ wss, port, url: `ws://localhost:${port}` });
        });
    });
}

function closeTestServer(wss) {
    return new Promise((resolve) => {
        // Terminar conexiones activas evita que el callback de close nunca se dispare.
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
    });
}

module.exports = { createTestServer, closeTestServer };
