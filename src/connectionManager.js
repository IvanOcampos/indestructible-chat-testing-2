const WS_OPEN = 1; // WebSocket.OPEN

class ConnectionManager {
    constructor(idPrefix = 'user') {
        this.clients = new Map(); // socket -> { id, nickname }
        this.idPrefix = idPrefix;
        this._nextId = 1;
    }

    addClient(socket) {
        const id = `${this.idPrefix}-${this._nextId++}`;
        const client = { id, nickname: id, socket };
        this.clients.set(socket, client);
        return client;
    }

    removeClient(socket) {
        const client = this.clients.get(socket);
        if (client) this.clients.delete(socket);
        return client || null;
    }

    getClient(socket) {
        return this.clients.get(socket) || null;
    }

    getClientCount() {
        return this.clients.size;
    }

    getActiveUsers() {
        return [...this.clients.values()].map(({ id, nickname }) => ({ id, nickname }));
    }

    setNickname(socket, nickname) {
        if (typeof nickname !== 'string') {
            return { ok: false, error: 'El nickname debe ser un string' };
        }
        const trimmed = nickname.trim();
        if (trimmed.length === 0) {
            return { ok: false, error: 'El nickname no puede estar vacío' };
        }
        if (trimmed.length > 30) {
            return { ok: false, error: 'El nickname excede el límite de 30 caracteres' };
        }
        const client = this.clients.get(socket);
        if (!client) {
            return { ok: false, error: 'El cliente no está conectado' };
        }
        client.nickname = trimmed;
        return { ok: true, nickname: trimmed };
    }

    broadcast(payload, exceptSocket = null) {
        const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
        let sent = 0;
        for (const [socket] of this.clients) {
            if (socket === exceptSocket) continue;
            if (socket.readyState !== WS_OPEN) continue;
            socket.send(data);
            sent += 1;
        }
        return sent;
    }
}

module.exports = { ConnectionManager };
