const { validateMessage } = require('../../src/validators/message');

describe('validateMessage', () => {
    describe('casos positivos (happy path)', () => {
        test('acepta un mensaje válido normal', () => {
            const result = validateMessage('Hola, ¿cómo estás?');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('Hola, ¿cómo estás?');
        });

        test('recorta los espacios en blanco al inicio y al final', () => {
            const result = validateMessage('   hola mundo   ');
            expect(result.valid).toBe(true);
            expect(result.sanitized).toBe('hola mundo');
        });

        test('acepta un mensaje de exactamente 500 caracteres', () => {
            const result = validateMessage('a'.repeat(500));
            expect(result.valid).toBe(true);
            expect(result.sanitized).toHaveLength(500);
        });
    });

    describe('casos negativos', () => {
        test('rechaza un mensaje vacío', () => {
            const result = validateMessage('');
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/vacío/i);
        });

        test('rechaza un mensaje de solo espacios en blanco', () => {
            const result = validateMessage('     ');
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/vacío/i);
        });

        test('rechaza un mensaje mayor a 500 caracteres', () => {
            const result = validateMessage('a'.repeat(501));
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/500/);
        });

        test('rechaza valores que no son string: número', () => {
            const result = validateMessage(123);
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/string/i);
        });

        test('rechaza valores que no son string: null', () => {
            const result = validateMessage(null);
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/string/i);
        });

        test('rechaza valores que no son string: objeto', () => {
            const result = validateMessage({ text: 'hola' });
            expect(result.valid).toBe(false);
            expect(result.error).toMatch(/string/i);
        });
    });
});
