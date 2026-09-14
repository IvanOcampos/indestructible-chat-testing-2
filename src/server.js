const { WebSocketServer } = require('ws');
const { ConnectionManager } = require('./connectionManager');
const { validateMessage } = require('./validators/message');
const { RateLimiter } = require('./rateLimiter');

const WS_OPEN = 1;

function send(socket, payload) {
    if (socket.readyState === WS_OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

function createChatServer({ port = 0, rateLimit = {} } = {}) {
    return new Promise((resolve) => {
        const manager = new ConnectionManager();
        const limiter = new RateLimiter({ max: 5, windowMs: 1000, ...rateLimit });
        let seq = 0; // número de secuencia global para garantizar orden de entrega

        const wss = new WebSocketServer({ port });

        wss.on('connection', (socket) => {
            const client = manager.addClient(socket);

            send(socket, { type: 'welcome', user: client.nickname, users: manager.getActiveUsers(), seq: ++seq });
            manager.broadcast({ type: 'user_joined', user: client.nickname, users: manager.getActiveUsers(), seq: ++seq }, socket);

            socket.on('message', (raw) => {
                let parsed;
                try {
                    parsed = JSON.parse(raw.toString());
                } catch {
                    send(socket, { type: 'error', message: 'Formato JSON inválido', seq: ++seq });
                    return;
                }

                if (parsed && parsed.type === 'set_nickname') {
                    const result = manager.setNickname(socket, parsed.nickname);
                    if (!result.ok) {
                        send(socket, { type: 'error', message: result.error, seq: ++seq });
                        return;
                    }
                    manager.broadcast({ type: 'nickname_updated', user: result.nickname, users: manager.getActiveUsers(), seq: ++seq });
                    return;
                }

                if (parsed && parsed.type === 'message') {
                    const limit = limiter.check(client.id);
                    if (!limit.allowed) {
                        send(socket, { type: 'error', message: `Rate limit excedido: máximo ${limiter.max} mensajes por ${limiter.windowMs} ms. Reintenta en ${Math.ceil(limit.retryAfterMs)} ms`, seq: ++seq });
                        return;
                    }
                    const validation = validateMessage(parsed.text);
                    if (!validation.valid) {
                        send(socket, { type: 'error', message: validation.error, seq: ++seq });
                        return;
                    }
                    manager.broadcast({ type: 'message', user: client.nickname, text: validation.sanitized, timestamp: Date.now(), seq: ++seq });
                    return;
                }

                send(socket, { type: 'error', message: 'Tipo de mensaje no soportado', seq: ++seq });
            });

            socket.on('close', () => {
                const removed = manager.removeClient(socket);
                limiter.reset(client.id);
                if (removed) {
                    manager.broadcast({ type: 'user_left', user: removed.nickname, users: manager.getActiveUsers(), seq: ++seq }, socket);
                }
            });

            // Un error de socket no debe tumbar el servidor; el evento 'close' limpia el estado.
            socket.on('error', () => {});
        });

        wss.on('listening', () => {
            const { port: boundPort } = wss.address();
            resolve({ wss, port: boundPort, url: `ws://localhost:${boundPort}`, manager, limiter });
        });
    });
}

if (require.main === module) {
    const port = Number(process.env.PORT) || 3000;
    createChatServer({ port }).then(({ url }) => {
        console.log(`Chat server escuchando en ${url}`);
    });
}

module.exports = { createChatServer };
