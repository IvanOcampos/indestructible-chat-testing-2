const { ConnectionManager } = require('../../src/connectionManager');

function fakeSocket(readyState = 1) {
    return { readyState, send: jest.fn() };
}

describe('ConnectionManager', () => {
    let manager;
    beforeEach(() => {
        manager = new ConnectionManager();
    });

    describe('addClient / getClient / getClientCount', () => {
        test('registra un cliente con id y nickname automáticos', () => {
            const socket = fakeSocket();
            const client = manager.addClient(socket);
            expect(client.id).toBe('user-1');
            expect(client.nickname).toBe('user-1');
            expect(manager.getClient(socket)).toEqual(client);
            expect(manager.getClientCount()).toBe(1);
        });

        test('asigna ids incrementales a cada cliente', () => {
            const c1 = manager.addClient(fakeSocket());
            const c2 = manager.addClient(fakeSocket());
            expect(c1.id).not.toBe(c2.id);
            expect(manager.getClientCount()).toBe(2);
        });
    });

    describe('removeClient', () => {
        test('elimina un cliente y devuelve su información', () => {
            const socket = fakeSocket();
            manager.addClient(socket);
            const removed = manager.removeClient(socket);
            expect(removed.id).toBe('user-1');
            expect(manager.getClientCount()).toBe(0);
            expect(manager.getClient(socket)).toBeNull();
        });

        test('devuelve null al eliminar un socket desconocido', () => {
            expect(manager.removeClient(fakeSocket())).toBeNull();
            expect(manager.getClientCount()).toBe(0);
        });
    });

    describe('getActiveUsers', () => {
        test('lista los usuarios activos sin exponer el socket', () => {
            manager.addClient(fakeSocket());
            manager.addClient(fakeSocket());
            const users = manager.getActiveUsers();
            expect(users).toHaveLength(2);
            users.forEach((u) => {
                expect(u).toHaveProperty('id');
                expect(u).toHaveProperty('nickname');
                expect(u).not.toHaveProperty('socket');
            });
        });
    });

    describe('setNickname', () => {
        test('actualiza el nickname recortando espacios', () => {
            const socket = fakeSocket();
            manager.addClient(socket);
            const result = manager.setNickname(socket, '  ivan  ');
            expect(result.ok).toBe(true);
            expect(result.nickname).toBe('ivan');
            expect(manager.getClient(socket).nickname).toBe('ivan');
        });

        test('rechaza nickname vacío o de solo espacios', () => {
            const socket = fakeSocket();
            manager.addClient(socket);
            expect(manager.setNickname(socket, '').ok).toBe(false);
            expect(manager.setNickname(socket, '   ').ok).toBe(false);
        });

        test('rechaza nickname mayor a 30 caracteres', () => {
            const socket = fakeSocket();
            manager.addClient(socket);
            const result = manager.setNickname(socket, 'a'.repeat(31));
            expect(result.ok).toBe(false);
            expect(result.error).toMatch(/30/);
        });

        test('rechaza nickname que no es string', () => {
            const socket = fakeSocket();
            manager.addClient(socket);
            expect(manager.setNickname(socket, 42).ok).toBe(false);
        });

        test('rechaza nickname para un socket no registrado', () => {
            const result = manager.setNickname(fakeSocket(), 'ivan');
            expect(result.ok).toBe(false);
        });
    });

    describe('broadcast', () => {
        test('envía el payload a todos los clientes abiertos', () => {
            const s1 = fakeSocket();
            const s2 = fakeSocket();
            manager.addClient(s1);
            manager.addClient(s2);
            const sent = manager.broadcast({ type: 'message', text: 'hola' });
            expect(sent).toBe(2);
            expect(s1.send).toHaveBeenCalledTimes(1);
            expect(s2.send).toHaveBeenCalledTimes(1);
            expect(JSON.parse(s1.send.mock.calls[0][0])).toEqual({ type: 'message', text: 'hola' });
        });

        test('excluye al socket indicado', () => {
            const s1 = fakeSocket();
            const s2 = fakeSocket();
            manager.addClient(s1);
            manager.addClient(s2);
            const sent = manager.broadcast({ type: 'message', text: 'hola' }, s1);
            expect(sent).toBe(1);
            expect(s1.send).not.toHaveBeenCalled();
            expect(s2.send).toHaveBeenCalledTimes(1);
        });

        test('no envía a sockets que no están abiertos', () => {
            const open = fakeSocket(1);
            const closing = fakeSocket(2); // WebSocket.CLOSING
            const closed = fakeSocket(3);  // WebSocket.CLOSED
            manager.addClient(open);
            manager.addClient(closing);
            manager.addClient(closed);
            const sent = manager.broadcast('hola');
            expect(sent).toBe(1);
            expect(open.send).toHaveBeenCalledWith('hola');
            expect(closing.send).not.toHaveBeenCalled();
            expect(closed.send).not.toHaveBeenCalled();
        });

        test('con cero clientes no envía nada y no falla', () => {
            expect(manager.broadcast({ type: 'x' })).toBe(0);
        });
    });
});
