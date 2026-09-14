const { createChatServer } = require('../../src/server');
const { connectAndWelcome, nextMessage, waitForMessages, recordMessages } = require('../helpers/waitFor');
const { closeTestServer } = require('../helpers/testServer');

describe('Integración: múltiples clientes', () => {
    let server, url, clients;

    beforeEach(async () => {
        server = await createChatServer({ port: 0 });
        url = server.url;
        clients = [];
    });

    afterEach(async () => {
        for (const c of clients) c.terminate();
        await closeTestServer(server.wss);
    });

    async function connect(nickname) {
        const { socket, welcome } = await connectAndWelcome(url);
        clients.push(socket);
        if (nickname) {
            socket.send(JSON.stringify({ type: 'set_nickname', nickname }));
            await nextMessage(socket, (message) => message.type === 'nickname_updated');
        }
        return socket;
    }

    function sendMessage(socket, text) {
        socket.send(JSON.stringify({ type: 'message', text }));
    }

    test('3 clientes conectados: un mensaje llega a todos los demás', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        const c = await connect('caro');

        const waiting = [a, b, c].map((s) =>
            waitForMessages(s, (m) => m.type === 'message' && m.text === 'saludos', 1)
        );
        sendMessage(a, 'saludos');
        const [ra, rb, rc] = await Promise.all(waiting);

        expect(ra[0]).toMatchObject({ user: 'ana', text: 'saludos' });
        expect(rb[0].seq).toBe(ra[0].seq);
        expect(rc[0].seq).toBe(ra[0].seq);
    });

    test('todos-a-todos: 3 clientes envían simultáneamente, todos reciben los 3 mensajes sin pérdida ni duplicación', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        const c = await connect('caro');
        const all = [a, b, c];
        const expected = ['msg-de-ana', 'msg-de-beto', 'msg-de-caro'];

        const waiting = all.map((s) =>
            waitForMessages(s, (m) => m.type === 'message', 3, 3000)
        );
        all.forEach((s, i) => sendMessage(s, expected[i])); // envío simultáneo, sin await entre medias
        const results = await Promise.all(waiting);

        results.forEach((messages) => {
            const texts = messages.map((m) => m.text).sort();
            expect(texts).toEqual([...expected].sort());
            const seqs = messages.map((m) => m.seq);
            expect(new Set(seqs).size).toBe(3); // sin duplicados
        });
    });

    test('los mensajes se entregan en el orden correcto a todos los clientes', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        const c = await connect('caro');

        const recorders = [a, b, c].map((s) => recordMessages(s));
        for (let i = 1; i <= 5; i++) sendMessage(a, `orden-${i}`);
        await waitForMessages(c, (m) => m.type === 'message' && m.text === 'orden-5', 1);

        recorders.forEach(({ messages, stop }) => {
            stop();
            const seqs = messages.filter((m) => m.type === 'message').map((m) => m.seq);
            const sorted = [...seqs].sort((x, y) => x - y);
            expect(seqs).toEqual(sorted); // orden de secuencias estrictamente creciente
            const texts = messages.filter((m) => m.type === 'message').map((m) => m.text);
            expect(texts).toEqual(['orden-1', 'orden-2', 'orden-3', 'orden-4', 'orden-5']);
        });
    });

    test('un mensaje enviado justo al conectarse no se pierde', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        const c = await connect('caro');
        sendMessage(a, 'temprano');
        // c se conecta DESPUÉS: no debe recibirlo (no es backlog), pero a y b sí
        const [ra, rb] = await Promise.all([
            waitForMessages(a, (m) => m.type === 'message' && m.text === 'temprano', 1),
            waitForMessages(b, (m) => m.type === 'message' && m.text === 'temprano', 1),
        ]);
        expect(ra[0].seq).toBe(rb[0].seq);
        expect(server.manager.getClientCount()).toBe(3);
    });
});
