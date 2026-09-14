const { createChatServer } = require('../../src/server');
const { connectAndWelcome, nextMessage, expectSilence, waitForMessages } = require('../helpers/waitFor');
const { closeTestServer } = require('../helpers/testServer');

describe('Integración: desconexiones abruptas', () => {
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
            await nextMessage(socket, (m) => m.type === 'nickname_updated');
        }
        return socket;
    }

    function sendMessage(socket, text) {
        socket.send(JSON.stringify({ type: 'message', text }));
    }

    test('un cliente que se desconecta abruptamente notifica user_left a los demás', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        a.terminate(); // desconexión abrupta (no cierra con handshake)
        const left = await nextMessage(b, (m) => m.type === 'user_left');
        expect(left.user).toBe('ana');
        expect(left.users.map((u) => u.nickname)).toEqual(['beto']);
        expect(server.manager.getClientCount()).toBe(1);
    });

    test('los clientes restantes siguen chateando sin verse afectados tras una desconexión', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        const c = await connect('caro');
        a.terminate();

        await nextMessage(b, (m) => m.type === 'user_left' && m.user === 'ana');
        sendMessage(b, '¿siguen ahí?');
        const received = await nextMessage(c, (m) => m.type === 'message');
        expect(received).toMatchObject({ user: 'beto', text: '¿siguen ahí?' });
    });

    test('varias desconexiones simultáneas no bloquean el servidor', async () => {
        const a = await connect('ana');
        const b = await connect('beto');
        const c = await connect('caro');
        const d = await connect('dani');

        a.terminate();
        b.terminate();

        // c y d reciben ambas notificaciones
        await waitForMessages(c, (m) => m.type === 'user_left', 2);
        await waitForMessages(d, (m) => m.type === 'user_left', 2);
        expect(server.manager.getClientCount()).toBe(2);

        // el servidor sigue funcionando: c y d intercambian mensajes
        sendMessage(c, 'todavía funciono');
        const received = await nextMessage(d, (m) => m.type === 'message');
        expect(received.text).toBe('todavía funciono');
    });

    test('un mensaje enviado mientras otro cliente se desconecta no causa errores', async () => {
        const a = await connect('ana');
        const b = await connect('beto');

        const received = nextMessage(b, (m) => m.type === 'message');
        a.terminate(); // la desconexión ocurre mientras b espera
        sendMessage(b, 'mensaje tras la caída');

        const msg = await received;
        expect(msg.text).toBe('mensaje tras la caída');
        // el servidor sigue operativo y no emitió errores a b
        await expectSilence(b, (m) => m.type === 'error');
    });
});
