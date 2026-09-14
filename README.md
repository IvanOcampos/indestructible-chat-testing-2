# indestructible-chat-testing

A battle-tested WebSocket/Socket.io chat application with a comprehensive testing suite covering unit tests, TDD workflows, multi-client integration testing, and abrupt-disconnection resilience — built to eliminate flaky async tests through event-driven assertions instead of fixed timeouts.

## Requisitos

- Node.js >= 18
- npm

## Instalación y ejecución

```bash
npm install
npm start            # levanta el servidor en ws://localhost:3000 (PORT para cambiarlo)
npm test             # ejecuta toda la suite (unitarias + integración)
npm run test:unit    # solo pruebas unitarias
npm run test:integration  # solo integración (con --runInBand para aislar puertos)
npm run test:coverage     # suite + informe de cobertura (umbral >= 80%)
```

## Arquitectura

```
src/
├── server.js               # Servidor WebSocket: conexiones, difusión, seq global, integración de módulos
├── connectionManager.js    # Registro de clientes, nicknames y broadcast seguro (readyState)
├── rateLimiter.js          # Límite de mensajes por ventana (funcionalidad TDD)
└── validators/message.js   # Validación y saneamiento de mensajes (500 chars máx., no vacío)
tests/
├── helpers/                # Servidor de prueba y utilidades dirigidas por eventos (sin sleeps)
├── unit/                   # Pruebas unitarias (validators, ConnectionManager, RateLimiter)
└── integration/            # Integración (chat básico, multi-cliente, desconexiones)
```

## Protocolo

**Cliente → servidor** (JSON):

| Tipo | Campos | Descripción |
|---|---|---|
| `message` | `text` | Mensaje de chat (1–500 caracteres tras trim) |
| `set_nickname` | `nickname` | Cambiar nickname (1–30 caracteres) |

**Servidor → cliente** (JSON): `welcome`, `user_joined`, `user_left`, `nickname_updated`,
`message` (incluye `seq` monótono y `timestamp`) y `error`.

Cada payload de servidor lleva un `seq` global que permite a las pruebas verificar
**orden de entrega, pérdida y duplicación** sin depender de tiempos.

## Decisiones de diseño detectadas gracias a las pruebas

- **Sin sleeps fijos:** todas las aserciones asíncronas usan helpers dirigidos por eventos
  (`nextMessage`, `waitForMessages`, `expectSilence`) con timeouts de seguridad, eliminando
  tests flaky.
- **Broadcast defensivo:** `ConnectionManager.broadcast()` filtra por `readyState === OPEN`
  y permite excluir al emisor, así un mensaje enviado mientras otro cliente cae no rompe nada.
- **Servidor inmutable ante errores de socket:** el handler de `error` no lanza excepciones;
  el estado se limpia en `close`. Las desconexiones abruptas (`terminate()`) se propagan
  como `user_left` a los demás.
- **Rate limiting por cliente** (`RateLimiter`) con `now` inyectable: las pruebas unitarias
  son determinísticas (sin `setTimeout` reales) y las de integración validan el límite real.
- **Fix aplicado al config:** `jest.config.js` usaba `function: 80` en el umbral de cobertura;
  la clave correcta es `functions` (el umbral no se estaba aplicando).

## TDD: RateLimiter (ciclo Red-Green-Refactor)

La funcionalidad de rate limiting se desarrolló siguiendo TDD:

1. **Red** — se escribieron las pruebas en `tests/unit/rateLimiter.test.js`
   (permite hasta `max`, rechaza el excedente, reinicia la ventana, independencia por
   cliente, `reset`). Al correr `npx jest tests/unit/rateLimiter.test.js` la suite fallaba:
   `Cannot find module '../../src/rateLimiter'`.
2. **Green** — se implementó `src/rateLimiter.js` con el código mínimo: un `Map` de
   `{count, resetAt}` por clave y ventana deslizante fija. Las pruebas pasaron.
3. **Refactor** — se extrajo la dependencia `now` inyectable (antes `Date.now()` inline)
   para hacer las pruebas determinísticas y se consolidó el cálculo de `retryAfterMs`,
   sin cambiar el comportamiento (las pruebas siguen pasando).

El limitador se integró después en `src/server.js` (máx. 5 mensajes/segundo por cliente)
y se cubrió también con una prueba de integración (`chat.test.js` → "rate limiting").

## Cobertura

`npm run test:coverage` genera el informe (texto + HTML en `coverage/`).
`jest.config.js` exige un mínimo global del **80%** en líneas y funciones.

## Registro de pruebas

| Suite | Qué valida | Resultado |
|---|---|---|
| `unit/validators.test.js` | Happy path + casos negativos de `validateMessage` (rama completa) | ✅ |
| `unit/connectionManager.test.js` | Registro, eliminación, nicknames, broadcast con `readyState` y exclusión | ✅ |
| `unit/rateLimiter.test.js` | Ventana, rechazo, expiración, independencia por cliente (TDD) | ✅ |
| `integration/chat.test.js` | Conexión, bienvenida, difusión, errores (vacío/>500/JSON/tipo), rate limit, nicknames | ✅ |
| `integration/multiClient.test.js` | 3 clientes, envío simultáneo, sin pérdida/duplicación, orden por `seq` | ✅ |
| `integration/disconnection.test.js` | Caída abrupta, múltiples caídas, servidor sin bloqueos, clientes no afectados | ✅ |

> Todas las pruebas son independientes: cada `test` levanta su propio servidor en puerto
> efímero (`port: 0`) y lo cierra en `afterEach`.
