# Zitadel / OpenFGA 学習アプリ実装計画

## 目的

React と Hono で作る文書共有アプリに、Zitadel による認証と OpenFGA による関係ベース認可を組み込む。認証、API 境界でのトークン検証、リソース単位の認可、テストと運用ログを一連で学ぶことを目的とする。

初期版はローカル環境だけを対象とし、クラウドへのデプロイは行わない。

## 合意した技術構成

| 領域 | 採用するもの | 役割 |
| --- | --- | --- |
| Web | React + Vite + TypeScript | ログイン、文書一覧・編集・共有 UI |
| API | Hono + TypeScript | JWT 検証、業務 API、OpenFGA への認可照会 |
| 認証 | Zitadel | ローカルユーザーの認証、OIDC アクセストークン発行 |
| 認可 | OpenFGA | 文書の所有・共有関係と操作可否の判定 |
| データ | PostgreSQL + Drizzle ORM | 文書本文・タイトルなど業務データの保存 |
| 開発基盤 | pnpm workspace / Docker Compose | パッケージ管理、依存サービスのローカル起動 |
| テスト | Vitest / Playwright | 権限モデル、API、ブラウザ操作の検証 |

```text
React (Vite)
  └─ Zitadel: Authorization Code + PKCE
       └─ access token
            └─ Hono API
                 ├─ jose: JWT / JWKS 検証
                 ├─ PostgreSQL: 文書データ
                 └─ OpenFGA: 所有・共有・権限
```

## リポジトリ構成

```text
apps/
  web/                 # React アプリ
  api/                 # Hono API
packages/
  shared/              # 共通型・設定値
infra/
  compose/             # Docker Compose 関連
  openfga/             # 認可モデルと初期関係
  zitadel/             # 初期化に必要な設定
scripts/               # TypeScript の bootstrap / reset スクリプト
docs/
  zitadel-openfga-learning-plan.md
```

## 認証設計

### ログインフロー

1. React が `oidc-client-ts` を使い、Zitadel に Authorization Code + PKCE でログインする。
2. Zitadel は API 用 `audience` を持つアクセストークンを発行する。
3. React は API 呼び出し時だけ Bearer トークンを Hono に送る。
4. Hono は `jose` と Zitadel の JWKS を使い、署名・`issuer`・`audience`・有効期限を検証する。
5. 検証済みトークンの `sub` を、OpenFGA の `user:<sub>` として扱う。

### トークン保持方針

- アクセストークンはメモリと `sessionStorage` のみに保持する。
- `localStorage` には保存しない。
- 初期版では永続セッションや BFF + `HttpOnly` Cookie は扱わない。

## 認可設計

### データの責務分担

- PostgreSQL: 文書 ID、タイトル、本文、作成日時、更新日時。
- OpenFGA: 誰がどの文書を所有・閲覧・編集できるか。
- 権限関係を PostgreSQL に複製しない。OpenFGA を権限の正本とする。

### OpenFGA モデル

```fga
model
  schema 1.1

type user

type document
  relations
    define owner: [user]
    define editor: [user]
    define viewer: [user]

    define can_read: owner or editor or viewer
    define can_write: owner or editor
    define can_share: owner
    define can_delete: owner
```

### 文書作成時の処理

1. API が PostgreSQL に文書を作成する。
2. API が `document:<id>#owner@user:<sub>` を OpenFGA に登録する。
3. 途中失敗時の整合性を考慮し、再試行可能な処理にする。

## 初期版の機能

| 操作 | 必要な権限 | OpenFGA 判定 |
| --- | --- | --- |
| 文書作成 | ログイン済み | なし。作成者を owner として登録 |
| 文書閲覧 | owner / editor / viewer | `can_read` |
| 文書編集 | owner / editor | `can_write` |
| 文書削除 | owner | `can_delete` |
| 共有・共有解除 | owner | `can_share` |
| 閲覧可能文書の一覧 | owner / editor / viewer | `ListObjects` で `can_read` |

共有先は、最初は事前作成したテストユーザーから選択する。メールアドレス検索、招待メール、チーム・組織共有は後続の拡張とする。

## ローカル環境と初期化

### Docker Compose で起動するもの

- PostgreSQL
- Zitadel
- OpenFGA

React と Hono は初期段階ではローカルプロセスとして起動する。必要になれば Compose に追加する。

### Bootstrap 方針

`pnpm bootstrap` を TypeScript で実装し、繰り返し実行しても既存環境を壊さない冪等なスクリプトにする。

実行内容:

1. Zitadel の組織、プロジェクト、React 用 OIDC アプリを作成または更新する。
2. Hono API 用 audience を設定する。
3. テストユーザーを作成または取得する。
4. OpenFGA store を作成または取得する。
5. OpenFGA の認可モデルを登録し、アプリ設定に model ID を反映する。
6. アプリが利用する設定値を表示またはローカル設定へ反映する。

Zitadel の最初の信頼の起点として、ローカルの `.env` に `ZITADEL_BOOTSTRAP_ADMIN_TOKEN` を手動で設定する。このファイルはコミットしない。リポジトリには `.env.example` のみを置く。

通常の bootstrap は削除を行わない。テスト文書・共有関係の削除と再作成は、開発環境限定の `pnpm reset:demo` に分ける。実行時には対象環境を検査する。

## 実装フェーズ

### フェーズ 1: 基盤

- [x] pnpm workspace を作成する。
- [x] `apps/web`、`apps/api`、`packages/shared`、`infra`、`scripts` を配置する。
- [x] Docker Compose と `.env.example` を用意する。
- [x] PostgreSQL の接続と Drizzle のマイグレーションを整備する。

### フェーズ 1 完了後の学習チェック

フェーズ 1 は、認証・認可を実装する前に必要なローカル基盤を動かす段階である。まだログインや API の権限制御は実装していない。

- [x] `docker compose --env-file .env -f infra/compose/docker-compose.yml ps` で PostgreSQL、OpenFGA、Zitadel が稼働していることを確認する。
- [x] Zitadel Console（`http://localhost:8080/ui/console`）を開けることを確認する。初期管理者の認証情報はローカルの `.env` にある `ZITADEL_FIRSTINSTANCE_ADMIN_*` を使う。ログイン名は `admin` だけではなく、`admin@auth-learning.localhost` のようにドメインまで入力する。

  初期管理者の完全なログイン名を確認するには、次を実行する。

  ```sh
  docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T postgres \
    psql -U app -d zitadel -c 'SELECT user_name FROM projections.login_names3_users;'
  ```
- [x] `curl http://localhost:8080/debug/healthz` が `ok` を返すことを確認する。
- [x] `curl http://localhost:8081/healthz` が `{"status":"SERVING"}` を返すことを確認する。
- [x] `pnpm db:migrate` を再実行し、既に適用済みのマイグレーションを安全に扱えることを確認する。
- [x] PostgreSQL の `documents` テーブルを確認し、タイトル・本文などの業務データだけを持ち、所有者や共有権限の列を持たないことを確認する。

  ```sh
  docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T postgres \
    psql -U app -d app -c '\d documents'
  ```

  出力には `id`、`title`、`body`、`created_at`、`updated_at` だけが含まれ、`owner`、`viewer`、`editor` などの権限列は存在しないことを確認する。

この時点で理解する責務分担:

- Zitadel は「誰か」を証明する認証基盤である。
- Hono はアクセストークンを検証して API の入口を守る（フェーズ 3 で実装）。
- OpenFGA は「そのリソースにその操作をしてよいか」を判定する認可基盤である（フェーズ 2 で実装）。
- PostgreSQL は文書本体を保存し、認可関係の正本にはしない。


### フェーズ 2: 認可基盤

- [x] OpenFGA のモデルを `infra/openfga` に管理する。
- [x] OpenFGA クライアントと `check` / `listObjects` の薄いラッパーを実装する。
- [x] `pnpm bootstrap:openfga` で OpenFGA store・モデルを準備する。
- [x] `owner` / `editor` / `viewer` の関係を検証するテストを書く。

### フェーズ 2 完了後の学習チェック

フェーズ 2 では、文書に対する権限を OpenFGA の関係として表現した。まだ Zitadel の実ユーザーによるログインとは接続していないため、テストでは `user:owner` のような仮のユーザー ID を使う。

- [x] `infra/openfga/model.json` を読み、`owner`、`editor`、`viewer` が文書に直接付与する関係であることを確認する。
- [x] `can_read` が owner / editor / viewer、`can_write` が owner / editor、`can_share` と `can_delete` が owner だけを許可する派生関係であることを確認する。
- [x] PostgreSQL の `documents` テーブルに所有者・共有権限の列を追加せず、OpenFGA を権限の正本にしていることを確認する。

  ```sh
  docker compose --env-file .env -f infra/compose/docker-compose.yml exec -T postgres \
    psql -U app -d app -c '\d documents'
  ```

  `owner`、`editor`、`viewer` などの列がなく、文書データだけがあることを確認する。これらの関係は OpenFGA に保存される。
- [x] `pnpm bootstrap:openfga` を続けて 2 回実行し、同じ OpenFGA store と認可モデル ID が表示されることを確認する。
- [x] `pnpm test:openfga` を実行し、owner / editor / viewer の 4 テストが成功することを確認する。
- [x] `DocumentAuthorizer.readableDocumentIds()` が SQL の権限条件ではなく、OpenFGA の `ListObjects` により閲覧可能な文書 ID を取得することを確認する。

この時点で理解する責務分担:

- API は「editor か」のようなロールを直接判定せず、「`can_write` が許可されるか」を OpenFGA に問い合わせる。
- この操作ベースの判定により、将来の認可モデル変更（たとえばチーム共有）では API の操作判定を保ったまま関係定義を拡張できる。
- フェーズ 3 で Zitadel の JWT にある `sub` を `user:<sub>` として OpenFGA へ渡し、仮のユーザー ID を実ユーザー ID に置き換える。

### フェーズ 3: 認証基盤

- [ ] `pnpm bootstrap` で Zitadel の OIDC アプリ、API audience、テストユーザーを設定する。
- [ ] React に `oidc-client-ts` によるログイン、コールバック、ログアウトを実装する。
- [ ] Hono に `jose` による JWKS キャッシュ付き JWT 検証ミドルウェアを実装する。
- [ ] 署名・issuer・audience・有効期限の拒否ケースをテストする。

### フェーズ 4: 文書 API と UI

- [ ] `documents` テーブルと CRUD API を実装する。
- [ ] 作成時に OpenFGA の owner 関係を登録する。
- [ ] 閲覧・編集・削除・共有 API に対応する FGA チェックを置く。
- [ ] `ListObjects` を使った文書一覧 API を実装する。
- [ ] React に一覧、詳細、編集、共有 UI を実装する。

### フェーズ 5: 品質と学習用ドキュメント

- [ ] 構造化ログを実装する。
- [ ] Vitest で認可モデルと API の結合テストを追加する。
- [ ] Playwright でログイン、共有、閲覧・編集拒否をテストする。
- [ ] セットアップ、構成図、トラブルシューティングを README に記載する。

## テスト計画

### Vitest

- owner は閲覧・編集・共有・削除できる。
- editor は閲覧・編集できるが、共有・削除できない。
- viewer は閲覧だけできる。
- 関係を削除すると対応する操作が拒否される。

### API 結合テスト

- トークンなし、署名不正、issuer 不正、audience 不正、期限切れを 401 とする。
- 認証済みでも権限がなければ 403 とする。
- 権限があれば想定する API 応答を返す。
- 一覧 API がアクセス可能な文書だけを返す。

### Playwright

- テストユーザーがログインできる。
- owner が文書を viewer / editor に共有できる。
- viewer は閲覧でき、編集 UI または編集 API を利用できない。
- editor は編集でき、共有操作を利用できない。

## ログと安全性

認可判定時は、以下を JSON の構造化ログとして標準出力に残す。

- リクエスト ID
- ユーザー `sub`
- 文書 ID
- 要求した権限
- 判定結果（許可・拒否）

アクセストークン、文書本文、パスワード、管理トークンは記録しない。

## 完了条件

- [ ] 3 名以上のテストユーザーでログインできる。
- [ ] owner / editor / viewer の権限が期待どおり機能する。
- [ ] Hono API が無効なトークンを拒否する。
- [ ] `pnpm bootstrap` を複数回実行しても環境が壊れない。
- [ ] 主要な許可・拒否ケースを Vitest、API 結合テスト、Playwright で確認できる。
- [ ] ローカルでセットアップからデモ実行まで再現できる。

## 後続の発展課題

- チーム・組織への共有と OpenFGA の関係継承
- メールアドレスによるユーザー検索・招待
- Zitadel のソーシャルログイン
- BFF と `HttpOnly` Cookie を用いたセッション管理
- Bootstrap の CI 実行
- 本番デプロイ、TLS、秘密情報管理
