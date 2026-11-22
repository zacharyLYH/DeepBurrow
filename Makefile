.PHONY: start stop reset logs env

env:
	@touch apps/api/.env
	@grep -q '^AUTH_SECRET=' apps/api/.env || echo "AUTH_SECRET=$$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" >> apps/api/.env
	@for key in SMTP_HOST SMTP_PORT SMTP_USERNAME SMTP_PASSWORD SMTP_FROM; do \
		grep -q "^$$key=" apps/api/.env || { echo "Missing $$key in apps/api/.env"; exit 1; }; \
	done

start: env
	docker compose up -d --build

stop:
	docker compose down

reset:
	docker compose down -v
	$(MAKE) start

logs:
	docker compose logs -f --tail=100
