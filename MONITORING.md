# Monitoreo y alertas — Komanda

El objetivo: enterarte en minutos si el VPS (o algo arriba) se cae. La regla de
oro es que **el monitor tiene que vivir afuera del VPS** — si está adentro,
muere con él y no te avisa.

Tres capas, dos externas (SaaS) y una interna:

| Capa | Herramienta | Detecta | Tiempo de aviso |
| :--- | :--- | :--- | :--- |
| Chequeo externo | UptimeRobot (free) | caída total / base caída | 1–5 min |
| Dead-man's switch | Healthchecks.io (free) + `ping-healthchecks` | VPS congelado / red partida | 1 min sin ping |
| Métricas del host | Netdata (opcional) | degradación (CPU/RAM/disco) | antes de caer |

## 1. Bot de Telegram (el canal de notificación)

1. En Telegram, abrí [@BotFather](https://t.me/BotFather) y mandá `/newbot`.
2. Te devuelve un **token** (ej. `123456:ABC-DEF...`). Guardalo.
3. Abrí tu bot, mandale cualquier mensaje y después visitá
   `https://api.telegram.org/bot<TOKEN>/getUpdates` — el `chat.id` que aparece
   es tu chat de notificación (o usá un grupo y agregá el bot).
4. Tenés: `TOKEN` + `CHAT_ID`. Son los dos datos que piden UptimeRobot y
   Healthchecks.

## 2. UptimeRobot (chequeo externo)

1. Creá cuenta en [uptimerobot.com](https://uptimerobot.com) (plan free).
2. **Add New Monitor → HTTP(s)**:
   - URL: `https://kda.ar/api/health/ready`
   - Intervalo: 5 min (free) o 1 min (pago).
   - Alert contacts: **Telegram** (pegás el token + chat ID).
3. Este endpoint es el health real de Fastify: devuelve 200 y chequea base,
   outbox, impresión y Mercado Pago. Si el VPS cae **o** la base deja de
   responder, el monitor falla y suena la alarma.

Opcional: un segundo monitor a la URL del storefront para cubrir el caso de que
solo Next esté caído pero Fastify siga vivo.

## 3. Healthchecks.io (dead-man's switch)

1. Creá cuenta en [healthchecks.io](https://healthchecks.io) (free).
2. **Add Check**: nombre `komanda-vps`, periodo 5 min, grace 5 min, alerta por
   **Telegram** (misma config que arriba).
3. Copiá la **Ping URL** (ej. `https://hc-ping.com/<uuid>`).
4. Ponela en el `.env` del deploy:

   ```bash
   HEALTHCHECKS_PING_URL=https://hc-ping.com/<uuid>
   ```

5. `docker compose up -d` — el contenedor `ping-healthchecks` hace ping cada
   minuto. Si el VPS se cae o se cuelga, los pings se cortan y Healthchecks te
   avisa por Telegram (el periodo de 5 min + grace da margen a reinicios).

## 4. Netdata (opcional, degradación del host)

```bash
# En el VPS, una sola vez:
bash <(curl -Ss https://my-netdata.io/kickstart.sh) --stable-channel --disable-telemetry
```

Después configurá alertas por CPU/RAM/disco (> 80 % sostenido) con notificación
a Telegram. Esto te avisa **antes** de que la máquina se ahogue, no cuando ya
está caída.

## Resumen de secretos que necesitás

| Dato | Dónde va |
| :--- | :--- |
| Bot token + chat ID | UptimeRobot y Healthchecks.io |
| `HEALTHCHECKS_PING_URL` | `.env` del deploy (usado por `ping-healthchecks`) |

Ninguno va en el repo: el token y el chat ID viven en los dashboards; la ping
URL vive en el `.env` del servidor.
