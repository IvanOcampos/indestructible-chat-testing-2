const WebSocket = require('ws');

// Conecta un cliente y resuelve cuando el socket queda abierto.
function connectClient(url) {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url);
        // El servidor puede emitir mensajes apenas acepta la conexión. Guardarlos
        // desde este momento evita perderlos entre `open` y el listener del test.
        socket.__messageQueue = [];
        socket.on('message', (raw) => {
            socket.__messageQueue.push(JSON.parse(raw.toString()));
        });
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function takeQueuedMessages(socket, predicate, count = 1) {
    const matches = [];
    const pending = [];
    for (const message of socket.__messageQueue || []) {
        if (matches.length < count && predicate(message)) {
            matches.push(message);
        } else {
            pending.push(message);
        }
    }
    socket.__messageQueue = pending;
    return matches;
}

// Espera un evento de forma dirigida por eventos (sin sleeps fijos).
// Para 'message', el predicado recibe el payload JSON parseado.
function waitForEvent(socket, event, predicate = () => true, timeoutMs = 2000) {
    return new Promise((resolve, reject) => {
        if (event === 'message') {
            const [queued] = takeQueuedMessages(socket, predicate);
            if (queued) {
                resolve(queued);
                return;
            }
        }
        const timer = setTimeout(() => {
            socket.off(event, handler);
            reject(new Error(`Timeout esperando el evento "${event}"`));
        }, timeoutMs);
        function handler(...args) {
            const data = event === 'message' ? JSON.parse(args[0].toString()) : args[0];
            if (!predicate(data)) return;
            clearTimeout(timer);
            socket.off(event, handler);
            if (event === 'message') takeQueuedMessages(socket, (message) => message === data);
            resolve(data);
        }
        socket.on(event, handler);
    });
}

// Próximo mensaje del servidor que cumpla el predicado (JSON parseado).
function nextMessage(socket, predicate = () => true, timeoutMs = 2000) {
    return waitForEvent(socket, 'message', predicate, timeoutMs);
}

// Registra todos los mensajes que lleguen a un socket hasta llamar a stop().
function recordMessages(socket) {
    const messages = [];
    const handler = (raw) => messages.push(JSON.parse(raw.toString()));
    socket.on('message', handler);
    return {
        messages,
        stop: () => socket.off('message', handler),
    };
}

// Conecta, consume el mensaje 'welcome' y devuelve { socket, welcome }.
async function connectAndWelcome(url, timeoutMs = 2000) {
    const socket = await connectClient(url);
    const welcome = await nextMessage(socket, (m) => m.type === 'welcome', timeoutMs);
    return { socket, welcome };
}

// Espera N mensajes que cumplan el predicado. Falla por timeout si no llegan.
async function waitForMessages(socket, predicate, count, timeoutMs = 2000) {
    const found = takeQueuedMessages(socket, predicate, count);
    return new Promise((resolve, reject) => {
        if (found.length >= count) {
            resolve(found);
            return;
        }
        const timer = setTimeout(() => {
            socket.off('message', handler);
            reject(new Error(`Timeout: se recibieron ${found.length}/${count} mensajes`));
        }, timeoutMs);
        function handler(raw) {
            const data = JSON.parse(raw.toString());
            if (predicate(data)) found.push(data);
            if (predicate(data)) takeQueuedMessages(socket, (message) => message === data);
            if (found.length >= count) {
                clearTimeout(timer);
                socket.off('message', handler);
                resolve(found);
            }
        }
        socket.on('message', handler);
    });
}

// Afirma que NINGÚN mensaje que cumpla el predicado llegue en un lapso corto.
function expectSilence(socket, predicate, durationMs = 300) {
    return new Promise((resolve, reject) => {
        const [queued] = takeQueuedMessages(socket, predicate);
        if (queued) {
            reject(new Error(`Se recibió un mensaje inesperado: ${JSON.stringify(queued)}`));
            return;
        }
        const timer = setTimeout(() => {
            socket.off('message', handler);
            resolve();
        }, durationMs);
        function handler(raw) {
            const data = JSON.parse(raw.toString());
            if (!predicate(data)) return;
            clearTimeout(timer);
            socket.off('message', handler);
            takeQueuedMessages(socket, (message) => message === data);
            reject(new Error(`Se recibió un mensaje inesperado: ${JSON.stringify(data)}`));
        }
        socket.on('message', handler);
    });
}

module.exports = { connectClient, waitForEvent, nextMessage, recordMessages, connectAndWelcome, waitForMessages, expectSilence };
