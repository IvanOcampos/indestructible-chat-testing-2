// RateLimiter: límite de mensajes por ventana de tiempo por cliente.
// Funcionalidad desarrollada con TDD (ciclo Red-Green-Refactor) - ver tests/unit/rateLimiter.test.js
class RateLimiter {
    constructor({ max = 5, windowMs = 1000, now = Date.now } = {}) {
        this.max = max;
        this.windowMs = windowMs;
        this.now = now; // inyectable para pruebas determinísticas
        this.hits = new Map();
    }

    check(key) {
        const t = this.now();
        const entry = this.hits.get(key);

        if (!entry || t >= entry.resetAt) {
            this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
            return { allowed: true, retryAfterMs: 0 };
        }

        entry.count += 1;
        if (entry.count > this.max) {
            return { allowed: false, retryAfterMs: entry.resetAt - t };
        }
        return { allowed: true, retryAfterMs: 0 };
    }

    reset(key) {
        this.hits.delete(key);
    }
}

module.exports = { RateLimiter };
