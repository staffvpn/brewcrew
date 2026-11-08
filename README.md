# Brew Crew

Telegram Mini App: симулятор кофейни с реальной экономикой, командой, проверками и абсурдными событиями. 18+.

- `index.html` и `sprites.png` — сама игра, без сборки.
- `functions/` — серверная часть на Cloudflare Pages Functions:
  - `POST /api/track` — игра раз в минуту отмечает игрока (подпись Telegram проверяется на сервере);
  - `POST /tg/webhook` — бот: `/start` и `/admin` (только для админов из `functions/_lib.js`);
  - `GET /tg/setup?key=WEBHOOK_SECRET` — один раз подключает вебхук и кнопку меню.
- `wrangler.toml` — привязка базы D1 `brewcrew` как `DB`.

Секреты задаются в Cloudflare Pages → Settings → Variables and Secrets: `BOT_TOKEN`, `WEBHOOK_SECRET`. В репозиторий их не кладём.
