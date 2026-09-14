const { createChatServer } = require('../../src/server');
const { connectAndWelcome, nextMessage, expectSilence } = require('../helpers/waitFor');
const { closeTestServer } = require('../helpers/testServer');

describe('Integración: chat básico', () => {
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

    async function connect() {
        const { socket, welcome } = await connectAndWelcome(url);
        clients.push(socket);
        return { socket, welcome };
    }

    test('el servidor acepta conexiones y envía un mensaje de bienvenida', async () => {
        const { socket, welcome } = await connect();
        expect(socket.readyState).toBe(1); // OPEN
        expect(welcome.type).toBe('welcome');
        expect(welcome.user).toBe('user-1');
        expect(welcome.users).toHaveLength(1);
    });

    test('notifica a los clientes existentes cuando alguien se une', async () => {
        const { socket: first } = await connect();
        const { socket: second } = await connect();
        const joined = await nextMessage(first, (m) => m.type === 'user_joined');
        expect(joined.user).toBe('user-2');
        expect(joined.users).toHaveLength(2);
        await expectSilence(second, (m) => m.type === 'user_joined');
    });

    test('difunde un mensaje válido a todos los clientes conectados', async () => {
        const { socket: a } = await connect();
        const { socket: b } = await connect();
        a.send(JSON.stringify({ type: 'message', text: 'Hola a todos' }));
        const receivedByA = await nextMessage(a, (m) => m.type === 'message');
        const receivedByB = await nextMessage(b, (m) => m.type === 'message');
        expect(receivedByA).toMatchObject({ type: 'message', user: 'user-1', text: 'Hola a todos' });
        expect(receivedByB).toMatchObject({ type: 'message', user: 'user-1', text: 'Hola a todos' });
        expect(receivedByA.seq).toBe(receivedByB.seq); // mismo mensaje, mismo seq
    });

    describe('manejo de errores (casos negativos)', () => {
        test('rechaza un mensaje vacío y no lo difunde', async () => {
            const { socket: a } = await connect();
            const { socket: b } = await connect();
            a.send(JSON.stringify({ type: 'message', text: '   ' }));
            const error = await nextMessage(a, (m) => m.type === 'error');
            expect(error.message).toMatch(/vacío/i);
            await expectSilence(b, (m) => m.type === 'error' || (m.type === 'message' && m.user === 'user-1'));
        });

        test('rechaza un mensaje mayor a 500 caracteres', async () => {
            const { socket: a } = await connect();
            a.send(JSON.stringify({ type: 'message', text: 'a'.repeat(501) }));
            const error = await nextMessage(a, (m) => m.type === 'error');
            expect(error.message).toMatch(/500/);
        });

        test('rechaza un payload que no es JSON válido', async () => {
            const { socket: a } = await connect();
            a.send('esto no es json{{{');
            const error = await nextMessage(a, (m) => m.type === 'error');
            expect(error.message).toMatch(/json/i);
        });

        test('rechaza un tipo de mensaje desconocido', async () => {
            const { socket: a } = await connect();
            a.send(JSON.stringify({ type: 'ping' }));
            const error = await nextMessage(a, (m) => m.type === 'error');
            expect(error.message).toMatch(/no soportado/i);
        });
    });

    describe('rate limiting (funcionalidad TDD)', () => {
        test('rechaza el sexto mensaje dentro de la misma ventana de 1 segundo', async () => {
            const { socket: a } = await connect();
            const { socket: b } = await connect();
            for (let i = 1; i <= 5; i++) {
                a.send(JSON.stringify({ type: 'message', text: `mensaje ${i}` }));
                await nextMessage(a, (m) => m.type === 'message' && m.text === `mensaje ${i}`);
            }
            a.send(JSON.stringify({ type: 'message', text: 'mensaje 6' }));
            const error = await nextMessage(a, (m) => m.type === 'error');
            expect(error.message).toMatch(/rate limit/i);
            await expectSilence(b, (m) => m.type === 'message' && m.text === 'mensaje 6');
        });
    });

    describe('nicknames', () => {
        test('permite cambiar el nickname y lo notifica a todos', async () => {
            const { socket: a } = await connect();
            const { socket: b } = await connect();
            a.send(JSON.stringify({ type: 'set_nickname', nickname: 'ivan' }));
            const updatedA = await nextMessage(a, (m) => m.type === 'nickname_updated');
            const updatedB = await nextMessage(b, (m) => m.type === 'nickname_updated');
            expect(updatedA.user).toBe('ivan');
            expect(updatedB.users.map((u) => u.nickname)).toContain('ivan');
        });

        test('rechaza un nickname inválido sin afectar a otros clientes', async () => {
            const { socket: a } = await connect();
            const { socket: b } = await connect();
            a.send(JSON.stringify({ type: 'set_nickname', nickname: '' }));
            const error = await nextMessage(a, (m) => m.type === 'error');
            expect(error.message).toMatch(/vacío/i);
            await expectSilence(b, (m) => m.type === 'error');
        });
    });
});
