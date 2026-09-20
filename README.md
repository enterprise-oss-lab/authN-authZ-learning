# AuthN / AuthZ Learning

Zitadel による認証と OpenFGA による認可を学ぶための、React + Hono 文書共有アプリです。

## Phase 1: 開発環境の起動

1. `.env.example` を `.env` にコピーし、ローカル専用の値に変更します。`ZITADEL_MASTERKEY` は ASCII でちょうど 32 文字必要です。
2. 依存パッケージをインストールします。
3. PostgreSQL、OpenFGA、Zitadel を起動します。
4. Drizzle のマイグレーションを適用します。

```sh
cp .env.example .env
pnpm install
docker compose --env-file .env -f infra/compose/docker-compose.yml up -d
pnpm db:migrate
pnpm bootstrap:openfga
pnpm dev
```

- Web: http://localhost:5173
- API health check: http://localhost:3000/health
- OpenFGA: http://localhost:8081
- Zitadel: http://localhost:8080

Zitadel のアプリケーション初期設定は、後続フェーズで `pnpm bootstrap` として自動化します。

`pnpm bootstrap:openfga` は OpenFGA store と認可モデルを作成または再利用し、生成された ID をローカル `.env` に保存します。

詳細な実装計画は [docs/zitadel-openfga-learning-plan.md](docs/zitadel-openfga-learning-plan.md) を参照してください。
