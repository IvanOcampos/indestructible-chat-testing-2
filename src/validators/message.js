function validateMessage(message) {
    if (typeof message != 'string') {
        return { valid: false, error: 'El mensaje debe ser un string' };
    }

    const trimmed = message.trim();
    if (trimmed.length === 0){
        return { valid: false, error: 'El mensaje no puede estar vacío' };
    }
    if (trimmed.length > 500) {
        return { valid: false, error: 'El mensaje excede el límite de 500 caracteres' };
    }
    return { valid: true, sanitized: trimmed };
}

module.exports = { validateMessage };
