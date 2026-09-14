// Funcionalidad desarrollada con TDD (Red -> Green -> Refactor).
// Estas pruebas se escribieron ANTES de la implementación (fase Red).
const { RateLimiter } = require('../../src/rateLimiter');

describe('RateLimiter', () => {
    test('permite hasta "max" mensajes dentro de la ventana', () => {
        let now = 1000;
        const limiter = new RateLimiter({ max: 3, windowMs: 1000, now: () => now });
        expect(limiter.check('u1').allowed).toBe(true);
        expect(limiter.check('u1').allowed).toBe(true);
        expect(limiter.check('u1').allowed).toBe(true);
    });

    test('rechaza el mensaje que excede el máximo dentro de la ventana', () => {
        let now = 1000;
        const limiter = new RateLimiter({ max: 3, windowMs: 1000, now: () => now });
        limiter.check('u1'); limiter.check('u1'); limiter.check('u1');
        const result = limiter.check('u1');
        expect(result.allowed).toBe(false);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    test('vuelve a permitir mensajes cuando la ventana expira', () => {
        let now = 1000;
        const limiter = new RateLimiter({ max: 2, windowMs: 1000, now: () => now });
        limiter.check('u1'); limiter.check('u1');
        expect(limiter.check('u1').allowed).toBe(false);
        now = 2001; // la ventana (resetAt = 2000) ya expiró
        expect(limiter.check('u1').allowed).toBe(true);
    });

    test('cuenta de forma independiente por cliente', () => {
        let now = 1000;
        const limiter = new RateLimiter({ max: 1, windowMs: 1000, now: () => now });
        expect(limiter.check('u1').allowed).toBe(true);
        expect(limiter.check('u1').allowed).toBe(false);
        expect(limiter.check('u2').allowed).toBe(true);
    });

    test('reset libera la cuota de un cliente inmediatamente', () => {
        let now = 1000;
        const limiter = new RateLimiter({ max: 1, windowMs: 1000, now: () => now });
        limiter.check('u1');
        expect(limiter.check('u1').allowed).toBe(false);
        limiter.reset('u1');
        expect(limiter.check('u1').allowed).toBe(true);
    });
});
