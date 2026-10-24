# Cloud services as seen from the client: Account, Sync, Publish, and every other network call

> Part of the [Obsidian 1.14.4 teardown](README.md). Static analysis of the shipped bundle;
> nothing here is Obsidian code. `app.js:NNNN` / `main.js:NNNN` / `worker.js:NNNN` point into the
> pretty-printed files described in the README (stable only for `obsidian.asar` sha256 `146ef847…2b92f`).
> Claims are marked **observed** (read in code), **inferred** (reasoned from code) or **unknown**.

Obsidian 1.14.4 ships every cloud feature inside the open renderer bundle. There is no separate native
module. Three hosts carry it. The **account API** (`https://api.obsidian.md`, with the `api` label built
from char codes) is a JSON-over-POST RPC that handles login, vault and site management, sharing and
licence checks. **Obsidian Sync** is one WebSocket per vault, opened to a server-assigned `*.obsidian.md`
host. It speaks JSON text frames plus raw binary chunk frames. All state that matters lives in a per-vault
IndexedDB blob of three maps: local file records, the last-known server records, and a pending queue of
server changes. A single-flight loop runs and does **one** action per iteration (merge, download, delete or
upload). Markdown conflicts are 3-way merged with diff-match-patch. Config JSON gets a key-wise merge. Every
other file type converges by letting the last uploader win. Encryption is client-side, through WebCrypto:
scrypt makes a master key, HKDF splits it into sub-keys, AES-256-GCM encrypts contents and AES-SIV
deterministically encrypts paths and hashes. A "keyhash" lets the server check the password without ever
seeing the key. **Obsidian Publish** is unencrypted. Raw file bytes go up to a per-site host over plain HTTP
POSTs with `obs-*` headers. The published website is the same `app.js` bundle running in "Publish" mode
(`dJ`). It pulls a server-built metadata cache, the site options and the files, and password-protected sites
use HMAC-signed URLs. Telemetry is minimal: an hourly update ping that carries a random install id, a
theme-download counter, and Google Analytics, which is injected only on custom-domain Publish sites that set
an id.

## Where it lives

| Minified id | Public / inferred name | Role | Lines |
|---|---|---|---|
| `vD`, `gD` | `API_HOST`, `PUBLISH_HOST` | `https://api.obsidian.md` (built from char codes 97,112,105 = "api"), `https://publish.obsidian.md` | app.js:46293 |
| `bD` | `apiPost(path, body, {preflight, headers})` | the account RPC transport: POST JSON, throws `mD` when the body has an `error` key | app.js:46305-46332 |
| `mD` | `ApiError` | `{response, error}` | app.js:46294-46304 |
| `wD kD CD ED MD SD xD TD DD AD PD ID LD OD FD RD BD ND VD` | thin RPC wrappers | signup, forgetpass, resendconfirmation, authtoken, signup-mobile, signin, business key, regions, vault list/create/migrate/rename/share-remove/access, publish create/delete/share, subscription list | app.js:46333-46415 |
| `HD` | `RequestError(code, message)` | error type for the Publish APIs (`{code,message}` replies) | app.js:46416-46426 |
| `zD`, `WD`, `_D`, `GD`, `qD` | publish transport | POST JSON to the publish host or a site host; `GD` = binary upload with `obs-*` headers; `qD` = http for localhost, else https | app.js:46427-46484 |
| `YD` / `XD` | `Account` (singleton) | email, name, token, license, key (commercial); `login`, `logout`, `getUserInfo`, `loginWithAuthToken`, `checkBizKey`; saved to localStorage `obsidian-account` | app.js:46485-46628 |
| `zA` (`qA`) | 16-byte `Block` | GF(2^128) doubling (`dbl`, R = 0x87) | app.js:48058-48085 |
| `jA` (`UA`) | `AesCtr` | HKDF info "ObsidianAesSivEnc" → AES-CTR-256 | app.js:48087-48120 |
| `_A` (`GA`) | `AesBlockCipher` | HKDF info "ObsidianAesSivMac" → AES-CBC-256 with zero IV, used as a raw block cipher | app.js:48122-48163 |
| `KA` | `Cmac` | AES-CMAC with subkeys K1/K2 | app.js:48165-48249 |
| `YA` | `AesSiv` | RFC 5297 style `seal`, `open`, `_s2v` (a port of miscreant.js; same error strings) | app.js:48249-48364 |
| `JA eP tP` | AES-GCM helpers | import key; encrypt = random 12-byte IV ‖ ct ‖ tag; decrypt | app.js:48365-48400 |
| `nP`, `iP` | `sha256Hex`, `sha256` | WebCrypto SHA-256 | app.js:48401-48420 |
| `oP`, `aP` | scrypt params, `deriveMasterKey(password, salt)` | N=32768, r=8, p=1, 32 bytes, maxmem 64 MiB; Node `crypto.scrypt` on desktop, `window.scrypt` (lib/scrypt.js) on mobile | app.js:48421-48446 |
| `sP` | `createEncryptionProvider(version, key, salt)` | v0 → `cP`; v2 or v3 → `uP`; anything else throws | app.js:48447-48459 |
| `lP`, `pP` | `computeKeyHash`, `passwordToKeyHash` | v0 = hex(SHA-256(key)); v2/3 = hex(HKDF(key, salt, "ObsidianKeyHash")) | app.js:48460-48494, 48657-48667 |
| `cP` | `EncryptionV0` | legacy provider | app.js:48495-48566 |
| `uP` | `EncryptionV2V3` | SIV paths + GCM content | app.js:48566-48653 |
| `hP` | `randomSalt()` | hex string of 16 random bytes | app.js:48654-48656 |
| `dP` | `validateVaultPassword` | derives the keyhash, then calls `/vault/access` | app.js:48668-48683 |
| `vP` | `parseObsidianUrl` | `obsidian://` callback parser (used for the `sync-setup` token handoff) | app.js:48684-48710 |
| `mP`, `yP` | PoW solver, `PowCache` | `/user/pow-challenge` for signup (SHA-256 brute force over a counter) | app.js:48722-48802 |
| `bP`, `wP` | default sync types and special files | `["image","audio","pdf","video"]`, `["app","appearance","appearance-data","hotkey","core-plugin","core-plugin-data"]` | app.js:48803 |
| `kx Cx Ex Mx Px` | extension lists | image, audio, video, pdf, publishable | app.js:43276 |
| `G4 K4 Y4 X4` | `SecretStorage` and its backends | desktop = Electron `safeStorage`, mobile = Capacitor SecureStorage; **not** used for the account token | app.js:103528-103729 |
| `Hx` | feature policy flags | plugins, themes, snippets, sync, publish, webViewer, devTools, insider; frozen from main-process `policy` IPC | app.js:43363, 146276; main.js:28-64, 3944-3958, 4367 |
| `mie` | `SyncSettingTab` | settings UI | app.js:135619-136032 |
| `bie` | `SyncVersionHistoryModal` | history list, preview, diff, restore | app.js:136032-136402 |
| `kie`, `Cie` | `SyncFileListModal`, `SyncBulkRestoreModal` | deleted and config file lists | app.js:136408-136576 |
| `Eie`, `Mie` | encryption upgrade intro and migrate modal | migrate a vault to encryption v3 | app.js:136576-136771 |
| `Sie` | `CreateRemoteVaultModal` | name, region, E2E or standard, password | app.js:136771-136888 |
| `xie` | `RemoteVaultListModal` | list, connect, rename, delete, share, leave | app.js:136888-137215 |
| `Tie` | `SyncLogModal` | filterable activity log | app.js:137215-137304 |
| `Die` | excluded-folders modal | `setIgnoreFolders` | app.js:137304-137331 |
| `Aie` | largest-files modal | top 20 of `serverFiles` by size | app.js:137331-137358 |
| `Pie` | `ConnectVaultModal` | password prompt → `/vault/access` → `setup` | app.js:137358-137520 |
| `Lie` | `VaultShareModal` | `/vault/share/list`, `invite`, `remove` | app.js:137547-137707 |
| `Fie` (+`Rie Bie Nie Vie`) | `SyncView` ("sync" sidebar, recent changes) | groups `serverFiles` into today, yesterday, week, older; refreshes every 5 min | app.js:137708-138074 |
| `Hie` | `SyncFilter` | `allowSyncFile`, `changeFilter` | app.js:138074-138149 |
| `Uie` | WS close-code names | 1000-1015 | app.js:138149-138166 |
| `Gie` | `SyncServerConnection` | WebSocket protocol client | app.js:138167-138650 |
| `Kie` | `Backoff` | exponential with jitter | app.js:138650-138683 |
| `Jie` | Sync core plugin (`id: "sync"`) | state, reconciler, persistence | app.js:138683-140334 |
| `e2` / `n2` | `threeWayMerge(base, local, remote)`, `renderLineDiff` | diff-match-patch | app.js:98757-98800 |
| `DF` | `diff_match_patch` (TS port with an extra `diff_wordMode`) | | app.js:57592-58267 |
| `j$…sZ`, `lZ` | Publish option keys and defaults | | app.js:87635 |
| `W$` | `PublishLinkResolver` | link resolution over the server-built metadata cache | app.js:87546-87635 |
| `H$`, `q$` | CryptoJS `enc.Hex`, `HmacSHA256` | used for signed Publish URLs | app.js:87546, 1695, 9361 |
| `jZ` | Publish password modal | POST `/pw` | app.js:89129-89200 |
| `dJ` | `Publish` (the public-site runtime, `window.publish`) | | app.js:90117-90595 |
| `fJ` | `PublishSite` | `loadCache`, `loadOptions`, `getInternalUrl`, signed suffix, `loadMarkdownFile` | app.js:90595-90742 |
| `Ane` + sections `Fne Rne Bne Wne jne Une _ne Gne Kne` | `PublishModal` (create site, options, review, upload, slug, passwords, custom domain) | | app.js:132533-134377 |
| `Yne`, `Xne`, `$ne`/`Zne` | site share modal, file diff modal, include/exclude folder modals | | app.js:134377-134648 |
| `tie` | Publish core plugin (`id: "publish"`) | | app.js:134648-135243 |
| `YD` UI: `Sne`, `xne`, account settings | login modal (with MFA), commercial-licence modal, account/Catalyst rows | | app.js:132088-132456 |
| `QS`, `GS`, `VS`, `zS` | generic HTTP and GitHub URL helpers with a proxy fallback | | app.js:42847-43055 |
| boot `main.js` | updater | | x/app/main.js:100-298 |

## How it works

### 1. Account (`YD`/`XD`)

**Transport (observed, app.js:46305-46332).** Every account call is `POST {vD}{path}` with a JSON body,
made with the renderer's own `fetch`. It does not go through the main-process `request-url` bridge, so the
API has to allow CORS from the app's origin (inferred). An optional `preflight` flag sends an `OPTIONS`
request first. A `User-Agent` header is added only if the module variable `yD` is non-empty. It is
initialised to `""` and is never reassigned in this bundle (observed, app.js:46304). Failure handling has
two levels: a non-2xx status throws `"HTTP Error <status>"`, and a 2xx JSON body that contains an `error`
key throws `mD` with `.error` holding the server message. The UI matches on substrings of that message:
`"Not logged in"`, `"2FA code is incorrect"`, `"2FA code"`, `"Challenge verification failed"`,
`"Your subscription to Obsidian Sync has expired"`, `"Vault not found"`
(app.js:46558, 46592, 132408, 49712, 139574-139575).

**Endpoints and payload shapes (observed, field names only):**

| Path | Request fields | Response fields used | Trigger |
|---|---|---|---|
| `/user/signup` | email, password, name, next (`"buy_sync"` in onboarding), pow | — | mobile/onboarding signup (app.js:49704) |
| `/user/pow-challenge` | — | algorithm (`"SHA-256"`), challenge, salt, maxNumber, signature, expiration | pre-computed when the signup screen opens (app.js:48776, 49639) |
| `/user/forgetpass` | email, captcha (literal `"captcha"`) | — | forgot password |
| `/user/resendconfirmation` | email, next | — | confirmation email |
| `/user/authtoken` | token | token, email, name, license | `obsidian://…?sync-setup&token=` handoff on mobile (app.js:49911-49935) |
| `/user/signin` | email, password, mfa | token, email, name, license | login modal `Sne` (app.js:132405), onboarding (49346) |
| `/user/signout` | token | — | logout; a `"Not logged in"` error is swallowed |
| `/user/info` | token | email, name, license | settings and sync tab open; a `"Not logged in"` error wipes the local token |
| `/subscription/list` | token | `sync` (truthy) | checked before "Connect" to a remote vault (app.js:137072) |
| `/subscription/business` | key | company, expiry, seats | `checkBizKey` |
| `/subscription/sync/signup-mobile` | token | — | mobile onboarding when the vault `limit` is 0 (app.js:49348, 49490) |
| `/vault/regions` | token, host? | regions[{value,name}] | create and migrate modals |
| `/vault/list` | token, supported_encryption_version (3) | limit, vaults[], shared[] | vault chooser |
| `/vault/create` | token, name, keyhash, salt, region, encryption_version | — | `Sie` |
| `/vault/migrate` | token, vault_uid, keyhash, salt, region, encryption_version | id, name, host, encryption_version, password?, salt? | `Mie` |
| `/vault/rename` | token, vault_uid, name | — | |
| `/vault/delete` | token, vault_uid | — | |
| `/vault/access` | token, vault_uid, keyhash, host, encryption_version | — (success = password correct) | `dP` during connect |
| `/vault/share/list`, `/invite`, `/remove` | token, vault_uid, (email or share_uid) | shares[{uid,email,name,accepted}] | `Lie` |
| `/publish/create` | token | id, host | new site |
| `/publish/list` | token | sites[], shared[], limit | site chooser (app.js:132874) |
| `/publish/delete` | token, site_uid | — | |
| `/publish/share/list`, `/invite`, `/remove`, `/accept` | token, site_uid, email / share_uid / code | | `Yne`, `acceptSiteShare` (app.js:132655) |

**Vault list item (observed field use, app.js:136955-137165, 137397-137417):** `id, name, region, size,
created, host, salt, password, encryption_version`; shared items add `share_uid`. Whether `password` is
present decides **"standard" encryption** (see §3.6).

**Token storage (observed, app.js:46485-46511).** A single JSON object
`{email, name, token, license, key}` goes into `localStorage["obsidian-account"]` **in plaintext**. The key
has **no** `appId` prefix, so every vault window shares it (they all share one app origin). Session-only
fields `keyValidation, company, expiry, seats` are never saved. `SecretStorage` (`X4`) is a separate, newer
facility: per-vault secrets (`<appId>-secrets-encrypted`) encrypted with Electron `safeStorage` on desktop
(`encryptString` → base64) or held in Capacitor SecureStorage on mobile (app.js:103537-103643). Plugins
reach it through the public `SecretComponent`/`app.secretStorage` API. It shows a warning Notice when
safeStorage encryption is unavailable (app.js:103679). **The account token does not use it** (observed: no
references from `YD`).

**Login flow (observed).** `Sne.login` sends email, password and mfa. If the error text contains
"2FA code", the form hides email and password and reveals the MFA field. Onboarding checks the MFA value
against `/^\d{6}$/` (app.js:49338). Mobile has a second route: the browser signs in on obsidian.md and
deep-links back with `obsidian://…?sync-setup&token=…`, and the app exchanges that one-time token at
`/user/authtoken`.

**Signup proof-of-work (observed, app.js:48722-48802).** The challenge carries `{algorithm, challenge, salt,
maxNumber, signature, expiration}`. The client loops n = 0…maxNumber until `hex(SHA-256(salt + ":" + n))`
equals `challenge`, then returns the challenge echoed with `solution: n` (this shape matches ALTCHA,
inferred). The solution is cached until 60 s before `expiration`. It is invalidated and recomputed after a
failure, and signup retries once on "Challenge verification failed".

**Licences (observed, what the client checks):**
- `license` (Catalyst tier string, e.g. `"vip"`) comes from signin and info. The client uses it to:
  label the Catalyst row in settings (app.js:132253-132273), show the **Insider build** toggle only when it
  is truthy (app.js:132027-132050; the main process stores `insider` in `obsidian.json` and the updater
  then follows `updateJson.beta`), feed debug info (app.js:51448), and gate a review-request banner
  (app.js:143057). It is a client-side visibility flag only; the real entitlement is on the server
  (inferred).
- `key` (commercial licence) is validated with `/subscription/business`. On success it records
  `keyValidation="valid"` with company, seats and expiry for display; on `mD` it clears the key and keeps
  the error text. The bundle uses it only for display (observed: no other reads of `keyValidation`).
- **Enterprise policy** (observed, main.js:3944-3958, 4367): when the app is named `obsidian-work` or
  config `isWork` is true, the main process reads `policy.json` (Windows: `C:\Program Files\<Obsidian|ObsidianWork>\policy.json`).
  `plugins` and `themes` may be `true` or an allow-list array; the other keys must be literally `true`.
  If the file is missing or does not parse, every feature is **off** (fail-closed, main.js:67-74, 3953-3960). The renderer freezes the result into `Hx`,
  and the `sync-setup` and `publish-sites` URI handlers check `Hx.sync`/`Hx.publish` (app.js:106227-106243).

### 2. Sync: transport and protocol (`Gie`)

**URL and host pinning (observed, app.js:138192-138204, 139437-139440).** The host comes from the server
(the vault list `host`). It is stored in sync data and turned into `wss://<host>`, or `ws://` for
`127.0.0.1`/`localhost`; the default for a missing host is `127.0.0.1:3003`, a dev server. Before
connecting, the client parses the URL and rejects any hostname that neither ends in `.obsidian.md` nor
equals `127.0.0.1`. It does this with **natives captured at module load**: `WebSocket`, `URL`, the
`URL.prototype.hostname` getter, and `String.prototype.endsWith` (`zie qie Wie jie`, app.js:138149).
Inferred purpose: a plugin that monkey-patches those globals cannot redirect sync traffic. The
`socket.binaryType` is `arraybuffer`. Region selection is entirely server-side: `/vault/regions` fills a
dropdown, `""` means automatic, and the chosen region's host comes back in later vault lists.

**Handshake (observed, app.js:138228-138276).** On open, the client sends one JSON frame:

| field | value |
|---|---|
| `op` | `"init"` |
| `token` | account token (in the frame body, **not** the URL) |
| `id` | vault id |
| `keyhash` | the encryption provider's keyhash (proof of password) |
| `version` | last server change uid this device has applied |
| `initial` | true until the first `ready` |
| `device` | device name (user setting, else OS hostname) |
| `encryption_version` | 0, 2 or 3 |

Reply: `{res:"ok", perFileMax?, userId?}`. `perFileMax` must be a non-negative integer or the connection is
dropped (default 208,666,624 bytes ≈ 199 MiB, app.js:138176). `status|res:"err"` with `msg` fails with
"Failed to authenticate: …". Any other non-"ok" reply also fails. Frames that are not strings are rejected
during login. Close code 1006 is reported as "Unable to connect to server."; other codes are named from the
`Uie` table and the RFC ranges.

**Liveness (observed).** Connect timeout 120 s (`_ie`). A heartbeat runs every 20 s: if no message has
arrived for over 10 s it sends `{op:"ping"}`, and if none has arrived for over 120 s it disconnects. `pong`
frames are ignored.

**Message catalogue (observed; client→server unless noted):**

| op | request fields | response fields |
|---|---|---|
| `ping` | — | `{op:"pong"}` |
| `pull` | uid | `{deleted?, size, pieces}` followed by `pieces` binary frames; concatenated, then decrypted |
| `push` (metadata-only: folder or deleted) | path(enc), relatedpath(enc or null), extension, hash `""`, ctime 0, mtime 0, folder, deleted | any |
| `push` (file) | path(enc), relatedpath(enc), **extension (plaintext)**, hash(enc), ctime, mtime, folder false, deleted false, size (**ciphertext** length), pieces | `{res:"ok"}` means the server already has the content and nothing is sent; otherwise the client sends `pieces` binary frames of ≤2 MiB (2,097,152), each acknowledged with a JSON response |
| `deleted` | suppressrenames: true | `{items:[{path(enc), size, ts, device, …}]}` |
| `history` | path(enc), last (uid cursor or null) | `{items:[{uid, path, relatedpath, size, ts, deleted, folder, device, username?, email?}], more}` |
| `restore` | uid | — |
| `usernames` | — | map userId → display name |
| `purge` | — | — (deletes stored history to free space) |
| `size` | — | `{size, limit, vault_size}` |
| server → `push` | — | `{op:"push", path(enc), hash(enc or ""), size, ctime, mtime, folder, deleted, uid, device, user}` |
| server → `ready` | — | `{op:"ready", version}` |

Any response with an `err` field throws. **Concurrency model (observed, app.js:138289-138648):** one
promise queue (`WT`) serialises every request, and there is exactly one `responsePromise` slot, so there
is never more than one request in flight. Binary frames go to a `dataPromise` slot or, if nothing is
waiting, to the `dataQueue` buffer. Server `push`/`ready` frames run through a separate `notifyQueue`, so
path decryption stays ordered. Request timeout is 60 s; a timeout disconnects the socket.

**Echo suppression (observed, app.js:138357, 138389, 138549-138551).** Before each push the client stores
`justPushed = {path(enc), folder, deleted, mtime, hash(enc)}`. The server broadcasts the change back. When
the broadcast matches field-for-field on the **ciphertext**, it is tagged `wasJustPushed` and recorded
without downloading. This only works because path and hash encryption are deterministic.

### 3. End-to-end encryption design

#### 3.1 Key derivation (observed, app.js:48421-48446)
- `master = scrypt(password.normalize("NFKC"), salt.normalize("NFKC"), N=32768, r=8, p=1, dkLen=32)`, maxmem 64 MiB.
- `salt` is a **string**: `hP()` = hex of 16 random bytes, 32 characters (app.js:48654). It is fed to scrypt
  and HKDF as UTF-8 bytes of that hex text. It is generated on the client for E2E vaults and stored on the
  server with the vault (`/vault/create` `salt`), and every device gets it from `/vault/list`.
- Desktop calls Node's `crypto.scrypt` through `window.require("crypto")`. Mobile calls the vendored
  `lib/scrypt.js`, which is ricmoo/scrypt-js commit 3f106c1 loaded by `index.html:20` as `window.scrypt`
  (observed).

#### 3.2 Provider v0 (`cP`, legacy) (observed, app.js:48495-48565)
- keyhash = hex(SHA-256(master)).
- Content: AES-256-GCM keyed directly by `master`; output = random 12-byte IV ‖ ciphertext ‖ 16-byte tag.
- Deterministic strings (paths, hashes): IV = the first 12 bytes of **unkeyed** SHA-256(plaintext), then
  AES-GCM; output = hex(IV ‖ ct ‖ tag).
- *Inferred weakness:* the IV is sent in the clear and is an unkeyed hash of the plaintext path or content
  hash. Anyone holding the ciphertext can therefore confirm a guessed path or guessed file content offline,
  without the key. v2/v3 close this gap.

#### 3.3 Provider v2/v3 (`uP`) (observed, app.js:48566-48653)
All sub-keys come from `master` through HKDF-SHA256:

| purpose | HKDF salt | info | key type |
|---|---|---|---|
| keyhash (sent to the server) | UTF-8(saltHex) | `ObsidianKeyHash` | exported raw 32 bytes → hex |
| AES-SIV MAC (CMAC) | UTF-8(saltHex) | `ObsidianAesSivMac` | AES-CBC-256, used as a single-block cipher (zero IV) |
| AES-SIV CTR | UTF-8(saltHex) | `ObsidianAesSivEnc` | AES-CTR-256 |
| file content | empty | `ObsidianAesGcm` | AES-GCM-256 |

- Deterministic strings: AES-SIV (RFC 5297 shape) with a one-component S2V and no associated data.
  `seal` = V(16-byte CMAC tag) ‖ AES-CTR(counter = V with bits 31 and 63 cleared, plaintext). Output is
  hex. `open` recomputes S2V over the decrypted plaintext, compares in constant time, and zeroes the
  output if verification fails (app.js:48270-48364).
  The code is a port of **miscreant.js**: same class split, same error texts, and the same WebCrypto
  `AES-CTR` `length: 16` counter width (inferred). That width only matters for inputs over 1 MiB, and paths
  and hashes are tiny.
- Content: AES-256-GCM, random 12-byte IV prefix. Empty files skip encryption entirely: a 0-byte payload
  goes up as 0 bytes, and a 12-byte blob decrypts to empty (app.js:48395, 138320, 138377).
- **v2 and v3 behave identically in the client** (`sP` routes both to `uP`, and the constructor accepts
  only 2 or 3). The UI offers "Upgrade vault encryption" whenever `encryptionVersion < 3`
  (app.js:135727), and migration recreates the vault server-side with `/vault/migrate`. Whatever differs
  between v2 and v3 is on the server (unknown). Version 1 is unsupported or absent.

#### 3.4 What is and is not encrypted (observed from the push and record fields)
- **Encrypted:** file contents, path, relatedpath (rename source), and the content hash (SHA-256 hex of the
  plaintext, deterministically encrypted).
- **Plaintext to the server:** file **extension**, size (ciphertext length, so plaintext + 28 bytes for
  GCM), ctime, mtime, folder and deleted flags, device name, vault name, account identity, and timing. The
  server assigns `uid`, `ts` and `user`. Deterministic path encryption also reveals which records share a
  path and the length of each path (SIV ciphertext = 16 + length of the plaintext bytes).

#### 3.5 Key verification
The password is never sent and neither is `master`. During connect, `dP` derives the keyhash and calls
`/vault/access` with `{vault_uid, keyhash, host, encryption_version}`. A wrong password makes the server
refuse, and the modal shows the server's message (app.js:137436-137485). The WebSocket `init` frame sends
the keyhash again, and the server refuses to sync when it does not match (inferred). HKDF domain separation
in v2/v3 keeps the keyhash cryptographically unrelated to the encryption sub-keys.

#### 3.6 "Standard" (server-managed) encryption (observed and inferred)
The create and migrate modals offer `end-to-end` or `standard`. With `standard`, the client sends
`keyhash: null` and no salt (app.js:136840-136846). After that, `/vault/list` returns the vault with a
`password` and `salt`. `Pie.connect` then derives the key from **that server-supplied password** and skips
the prompt (app.js:137397-137417). So standard mode runs the same client crypto, but the server holds the
secret and can decrypt (inferred).

#### 3.7 Key at rest (observed, app.js:139162-139167)
The 32-byte `master` is saved **base64 in IndexedDB** (`<appId>-sync` → store `data` → key `data`,
field `key`), alongside `salt`. It is not protected with safeStorage. The password itself is not stored.

### 4. Sync: data model and persistence (`Jie`)

**Persisted blob** (`saveData`, debounced 2 s; `dataVer: 2`) (observed, app.js:139162-139167):

| field | meaning |
|---|---|
| appId | guard: if it differs from the current app id, the state is reset and sync **paused** (app.js:139126) |
| vaultId, vaultName, host | remote vault binding |
| key (base64), salt, encryptionVersion | crypto material |
| deviceName, userId | identity |
| pause | paused flag |
| version | last applied server change uid (cursor) |
| initial | first full sync not yet completed |
| local | map path → LocalFile |
| remote | map path → ServerFile (last-known server state) |
| pending | ServerFile[] received but not yet applied |
| allowTypes, allowSpecialFiles, ignoreFolders | selective-sync filter |
| preventSleep | mobile only: keep awake while syncing |
| conflictAction | `"merge"` (default) or `"conflict"` |

`LocalFile` = `{path, previouspath, folder, ctime, mtime, size, hash, synctime, synchash}`.
`ServerFile` = `{path, size, hash, ctime, mtime, folder, deleted, uid, device, user, initial?}`.

**Data migrations (observed, app.js:139142-139156):** when `dataVer < 1`, every remote `.canvas` file
missing locally is re-queued (canvas used to be filtered out). When `dataVer < 2`, the same is done for
`.base` files.

**Local change capture (observed, app.js:139322-139396):** handlers on vault `create`, `modify`, `delete`,
`rename` and `raw`. `onFileAdd` refreshes the record (mtime and ctime with `Math.ceil`) and clears `hash`
when mtime or size changed. Rename moves the record to the new key and keeps the original
`previouspath`, which is how a chain of renames collapses to the first old path. `raw` events under
`configDir` queue the file for a re-stat, because config files are not in the vault tree. `TExternalFile`
is ignored. `scanFiles` walks the whole tree at load and setup and drops vanished records.

**Hashes** are SHA-256 hex of the raw bytes. The client reuses `metadataCache.getFileInfo(path).hash` when
mtime and size match (app.js:140064-140067), the same cache Publish uses.

**Schedulers (observed):** `requestSync` runs on every vault event, every **30 s** (app.js:138843), on
`ready`, and on pause toggles. It is single-flight (`syncing` flag). It loops `_sync()` while that returns
true and sleeps `max(0, 50 ms − time since the last network request)` between iterations. On mobile with
`preventSleep` it holds a keep-awake lock (`Bw`).

### 5. Sync: the reconciliation algorithm (`_sync`, app.js:139594-140055)

Each call does **at most one** state-changing action, then returns `true` so the loop runs again. It
returns `false` when idle or blocked.

0. **Gates:** paused, backoff not elapsed (logs "Waiting to connect to server"), no token (throws
   "Not logged in"). `getServer()` deduplicates concurrent connects, builds the encryption provider lazily
   (logs "Unable to decrypt vault" on failure), and on "subscription … expired" shows a notice. On
   "Vault not found" it shows a notice and runs `unsetup()`.
1. **Config scan** (when `scanSpecialFiles` is set: at load, at setup, and after a filter change): it pulls
   dot-paths out of `local`, then queues `configDir/*.json`, `themes/*/{manifest.json,theme.css}`,
   `snippets/*.css`, and `plugins/*/{manifest.json,main.js,styles.css,data.json}`, plus a stray
   `configDir/config` entry (inferred legacy; the filter rejects it). It stats each queued path into
   `local`.
2. **Apply pending server changes** in arrival order. For a pending record `p` at path `d`, `f` is the
   last-known server record and `v` the local record:
   - filtered out by `allowSyncFile` → accept (record it as known), no download;
   - illegal name (`TA` validator; on Android also `*?<>"`) → notice "Unable to download file with illegal name", skip; any `..` segment → skip;
   - path in retry backoff → defer (counted);
   - make sure `v.hash` exists (from the metadata cache, or read and hash), then:
   - same file hash on both sides → accept;
   - a later pending entry for the same path → "Skipped" (coalesce);
   - no local file → remote deleted? accept : **download**;
   - both folders → if the remote is deleted, delete the local folder when it is empty;
   - **local unchanged since the last sync** (`v.hash === f.hash`, or both folders) → remote wins: delete locally or download (fast-forward);
   - local file versus remote folder → rename local to `"<name> (Conflicted copy).<ext>"`;
   - `p.initial && p.mtime > v.mtime` → download (during the first sync, the newer mtime wins);
   - **Markdown 3-way merge** (not initial, both files, not deleted, `.md`, and `p.hash !== v.synchash`, meaning the local copy changed since this device last synced): read local `T`, pull base `A` = `f.uid` content (the previous server version this device knew), pull remote `L` = `p.uid`.
     - `A === L` or `T === L` → accept.
     - `conflictAction === "conflict"` → write local text to `"<base> (Conflicted copy <device> <YYYYMMDDHHmm>).md"`, overwrite the original with the remote.
     - No base (`A` empty) → if the file's ctime is under 3 minutes old, or `p.mtime > v.mtime`, back up local text to File Recovery (`storeTextFileBackup`) and take the remote; otherwise keep local (it will be uploaded).
     - Otherwise back up the local text, then `merged = e2(A, T, L)`: diff-match-patch `diff_main(base, local)`, semantic and efficiency cleanup, `patch_make(base, diff)`, `patch_apply(patches, remote)` (app.js:98757-98762). Local edits are re-applied on top of the remote version.
   - **Config JSON** (under `configDir/`, `.json`, size > 0): parse local and remote; when both are plain objects, take the local object and overwrite it **key by key with the remote's top-level keys** (local-only keys survive). Write it with 2-space indent. `core-plugins.json` is patched so `sync` always stays enabled (`patchCorePluginsFile`, app.js:140174-140179).
   - other config files → download (remote wins);
   - **everything else** (canvas, base, binaries, plus md during the initial phase or for deletes) with local changes → "Rejected server change": the record is accepted but the local bytes stay, so the upload phase pushes them and the last uploader wins. The overwritten version survives only in server history (inferred).
   - `g()` acceptance: stamp `v.synctime`, set `remote[d] = p`, splice `p` out of `pending`, mark dirty.
3. **Wait for `ready`.** No local→remote work happens until the server has finished replaying.
4. **Propagate local deletions:** any `remote` entry with no `local` entry and not already deleted is
   pushed as deleted. Files go first, longest path first; folders follow, longest first.
5. **Uploads:** consider every `local` entry that differs from `remote` (missing, deleted remotely,
   folder-flag, ctime, mtime, size or hash mismatch) and passes the filter:
   - skip while the path is in retry backoff;
   - on Linux and mobile (`$ie`), birthtime is unreliable, so the server's ctime replaces the local one when the local ctime is 0 or later than the server's (app.js:139982);
   - `size > perFileMax` → logSkip "File too large to sync";
   - **edit debounce** `canSyncLocalFile`: wait 10 s since the last sync for files under 10 KB, 20 s under 100 KB, 30 s above (app.js:139431-139436);
   - choose **the new folder with the shortest path** first, otherwise the **smallest changed file**;
   - folder → push `{folder:true, relatedpath: previouspath}`; file → read, hash, and if the hash equals the server's just mark it ("Comparing"), else push with ctime, mtime, hash, bytes and `relatedpath = previouspath`. Afterwards `synchash = hash`, `previouspath = ""`, `synctime = now`.
6. Nothing deferred → log "Fully synced", clear `fileRetry`, return false.

**Renames on the wire:** the new path is uploaded with `relatedpath` set to the old (encrypted) path, and
the old path is deleted in step 4. The server keeps the link: history shows "moved/renamed from", and
`deleted` takes `suppressrenames` (app.js:138442, 136320-136323).

**Download safety (observed, app.js:140068-140173):** before writing, the client waits for pending adapter
writes and re-stats the file. If mtime or size changed during the download it throws
"Download cancelled because file was changed locally". Writes go through `vault.modifyBinary` (and wait if
the file is being saved), preserving server ctime and mtime. Parent folders are created as needed. A
local folder whose name differs from the remote one only by case is renamed to match. A non-empty local
folder that blocks a file download becomes `"<name> (Conflicted copy)"`.

**Safety guards (observed):** an empty vault at load pauses sync with an explanatory log
(app.js:139138). Connecting to a remote vault from a non-empty local vault asks for confirmation first
(`showConfirmVault`, app.js:137508). After `setup`, sync starts **paused** until the user presses
"Start syncing" (app.js:137420, 137502). Third-party sync folders (Dropbox, iCloud, OneDrive) and
macOS Documents/Desktop locations get warnings (app.js:135634-135656).

**Retries and backoff (observed):**
- Per path: `fileRetry[path] = {count, error, ts}` with a delay of `min(5 s × 2^count, 300 s)`. The check
  is a **prefix** match, so a failing folder also blocks its children (app.js:139424-139458).
- Connection: `Kie(min 0, max 300000, base 5000)` gives a delay of `min(max, min + base·2^(count−1)·U(0.5,1))`.
  The constructor sets `jitter = i || true`, so jitter cannot be turned off (observed quirk,
  app.js:138655).

**Status** = `uninitialized | disconnected (no vault) | error (error flag or any fileRetry) | paused |
syncing | synced`; human-readable `syncStatus` strings ("Indexing...", "Uploading <path>", …) appear in a
status-bar tooltip debounced to 100 ms. **Sync log**: `{file, info, ts, error, type ∈ {"", "merge",
"skip"}}`, capped at 2000 entries on desktop and 500 on mobile, dropping the oldest 100 when full.
"Fully synced" is de-duplicated.

### 6. Selective sync filter (`Hie.allowSyncFile`, app.js:138097-138127)
- Paths inside `ignoreFolders` are excluded; a folder entry matches its own path, other entries match by
  the `folder/` prefix.
- Under `configDir/`: excluded if any segment is `node_modules` or starts with `.`. `workspace.json` and
  `workspace-mobile.json` **never** sync. Each other path maps to a category, and the category must be
  enabled:

| path under configDir | category |
|---|---|
| `app.json`, `types.json` | `app` |
| `appearance.json` | `appearance` |
| `themes/<name>/{theme.css,manifest.json}`, `snippets/*.css` | `appearance-data` |
| `hotkeys.json` | `hotkey` |
| `core-plugins.json`, `core-plugins-migration.json` | `core-plugin` |
| other top-level `*.json` | `core-plugin-data` |
| `community-plugins.json` | `community-plugin` |
| `plugins/<id>/{manifest.json,main.js,styles.css,data.json}` | `community-plugin-data` (off by default; enabling it shows a warning dialog) |

  Defaults: everything except `community-plugin` and `community-plugin-data`.
- Other dot-paths are excluded. Folders are always allowed. `md`, `canvas` and `base` always sync. Every
  other extension is gated by its type toggle (`image`, `audio`, `video`, `pdf`; `webm` counts as audio or
  video) or by `unsupported` (default off).
- `changeFilter` diffs the server records that were disallowed before and are allowed now, then re-queues
  them, shortest path first, so turning a type on downloads the existing remote files of that type.
- The cache is invalidated whenever the filter changes. Filter settings are per device (stored in IndexedDB),
  and the UI says "update this setting on all devices".

### 7. Version history and deleted files (observed, app.js:136032-136576, 140184-140272)
- History is paged with `history {path, last: <uid of the last item>}`. When an item has `relatedpath`
  (a rename), the next page continues under the old path, which is how history follows a file across
  renames.
- Grouping: consecutive versions from the same day, device and user within **1 h** (`gie`) collapse into
  one "N revisions" group.
- Preview: text types (`md`, `json`/`css`/`js`, `base`) are rendered, md as Markdown. Images become Blob
  URLs. Canvas gets a canvas preview. A diff toggle (persisted in `localStorage["history-show-diff"]`)
  uses `n2` = line-mode diff-match-patch with collapsible unchanged runs (5 or 10 lines of context).
- Restore: the current path takes the pulled bytes (`adapter.write`). A version under a different path, or
  a deleted file, goes through server `restore {uid}`. Bulk restore of deleted files runs from `Cie`.
- "View config files" lists `remote` records under `configDir/`. The CLI handlers `sync`, `sync:history`,
  `sync:read`, `sync:restore`, `sync:open`, `sync:deleted` and `sync:status` expose the same operations
  (app.js:138864-139028).

### 8. Obsidian Publish
**Plugin state (`tie`, app.js:134648-135243).** Saved in the plugin's `data.json`:
`{siteId, host, included: [folder], excluded: [folder]}`. Publishable files: extension in
`Px = images + audio + video + pdf + md + canvas` (**not `.base`**), plus any file *named*
`obsidian.css`, `publish.css`, `favicon.ico` or `publish.js`.

**Publish flag (observed, app.js:135166-135191):** frontmatter `publish` wins when present
(`"false"`/`"no"` → excluded, `"true"`/`"yes"` → included, otherwise truthiness). Without it, an excluded
folder prefix → false, then an included folder prefix → true, else null (neutral).

**Change scan (`scanForChanges`, app.js:134989-135058):** `/api/list {token, id, version: 2}` returns
`{owner, files: [{path, hash, ctime, mtime, size}]}`, and `isGuest = !owner`. For each remote file: local
missing or flagged false → `deleted`; local hash differs → `changed` (pre-checked only if the flag is
true); same hash → `to-delete`, the "unchanged" group, where ticking a file unpublishes it. Each local
publishable file not on the server → `new`, pre-checked if its flag is true. The hash is the same SHA-256
hex as in Sync, reused from the metadata cache when possible.

**Upload (observed, app.js:46462-46484, 135110-135129, 133933-134087):** sequential, one file at a time,
with a client-side limit of 50 MiB (`TOOLARGE`). `POST https://<site host>/api/upload` carries headers
`obs-token`, `obs-id` (site), `obs-path` (URI-encoded path), `obs-hash` (SHA-256 hex) and
`Content-Type: application/octet-stream`. The body is the **raw plaintext bytes**. Deletions go to
`/api/remove {token,id,path}`. There is **no encryption and no client-side metadata upload**. The reader
downloads a per-file metadata cache (frontmatter, aliases, permalinks, links), so the server must parse
the Markdown itself (inferred).

**Site host APIs** (POST JSON, error = `{code, message}` → `HD`): `/api/list`, `/api/options {options?}`
(get or set), `/api/password {}` (list) / `{name, pw}` (add) / `{del}` (remove), `/api/remove`,
`/api/download {path}` (bytes, used for the review diff, app.js:133544). **Publish host APIs**
(`publish.obsidian.md`): `/api/slug {id, host, slug}`, `/api/slugs {ids}` → `{id: slug}`,
`/api/site {slug}` (an error with code `NOTFOUND` means the slug is free), and
`/api/customurl {id, host, url?, redirect?}`. Site creation runs `/api/site` (availability check), then
`/publish/create` (→ id, host), then `/api/slug`, then `setup(id, host)`. Slugs must match
`^[a-z0-9-]+$`.

**Site options** (keys and defaults, app.js:87635):

| key | default |
|---|---|
| indexFile | "" |
| siteName | "" |
| logo | "" |
| noindex | false |
| defaultTheme | "light" (light, dark or system) |
| showThemeToggle | false |
| showNavigation | true |
| navigationOrdering | [] |
| navigationHiddenItems | [] |
| showGraph | true |
| showOutline | false |
| showSearch | false |
| showBacklinks | false |
| showHoverPreview | false |
| hideTitle | false |
| readableLineLength | true |
| strictLineBreaks | false |
| slidingWindowMode | false |
| googleAnalytics | "" |

**How the published site loads (`dJ`/`fJ`, app.js:90117-90742):**
- The server HTML injects `window.siteInfo = {uid, host, status, slug, customurl}` and optionally starts
  `window.preloadCache`, `preloadOptions` and `preloadPage` fetches for speed. The client consumes each
  one only when the response has an `obs-status` header (`hJ`/`uJ`), which proves it came from the real
  server and not some intermediary (inferred purpose).
- Requests: `GET {host}/options/{uid}`, `GET {host}/cache/{uid}{suffix}` (JSON map path →
  CachedMetadata, loaded into `W$` for link, alias and permalink resolution), and
  `GET {host}/access/{uid}/{encoded path}{suffix}` for every file (`loadMarkdownFile`, CSS, logo,
  favicons, all with `withCredentials: true`).
- `status: "degraded"` shows an "update your subscription" banner.
- **Password-protected sites:** the cache request returns 401, the client opens `jZ`, and
  `POST {host}/pw {id, pw}` returns `{hpw}`, stored in `localStorage[<site uid>]`. Every later URL gets
  `?ts=<T>&sig=<hex(HMAC-SHA256(message=String(T), key=hpw))>`, where T = (whole hours since epoch + 6) × 1 h,
  i.e. a time 5-6 h in the future. The pair is cached and only recomputed once T is more than an hour in
  the past, so one signature is reused for about 6-7 h (observed, app.js:90683-90690). T therefore acts as an
  hour-rounded expiry that keeps URLs cache-friendly; the server presumably rejects a stale T (inferred).
- **Custom-domain-only features:** `publish.js` (site-supplied JS, loaded as a script) and Google
  Analytics (`G-…` via gtag, else `UA-…` via analytics.js) are injected **only when `customurl` is set**,
  so on the shared `publish.obsidian.md` origin site owners cannot run code against other sites (inferred
  security rationale). `obsidian.css`/`publish.css` and `favicon-NNxNN.png` load on any site. Iframes get
  a `sandbox`.
- Public URLs: `https://publish.obsidian.md/<slug>/<path without .md, each segment URI-encoded with %20→+>`,
  or the custom domain, or a frontmatter `permalink` override.

**Sharing:** `/publish/share/*` (collaborators by email; guests cannot change password or GA settings).
`acceptSiteShare` uses `/publish/share/accept {code}`.

### 9. Every other external endpoint

| Host / path | Process | Trigger | Notes |
|---|---|---|---|
| `https://releases.obsidian.md/desktop?id=<install id>&v=<asar version>&p=<platform>` | boot main (x/app/main.js:149) | every update check: at launch (x/app/main.js:481), then hourly (`setInterval` 1 h, x/app/main.js:420), and manual checks | **the only usage ping**. `id` = 16 random bytes hex kept in `%APPDATA%/obsidian/id`; the result is ignored. Skipped when updates are disabled and the check is not manual |
| `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/desktop-releases.json`, falling back to `https://releases.obsidian.md/desktop-releases.json` | boot main (167, 188) | same | fields `minimumVersion, latestVersion, downloadUrl, hash, signature`, and `beta` for insiders |
| `downloadUrl` (from the JSON) | boot main (232) | when a newer version exists | gzip asar; SHA-256 (base64) **and** RSA-SHA256 signature checked against a certificate embedded in main.js; saved as `obsidian-<ver>.asar` |
| `https://easylist.to/easylist/easylist.txt`, `…/easyprivacy.txt` | Obsidian main (main.js:4365, 4084-4110) | web viewer with adblock on, refreshed every 4 days (configurable) | cached under userData `adblock/` |
| `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/{community-plugins,community-css-themes,community-plugin-stats,community-plugin-deprecation}.json` | renderer (`VS`) | community plugin/theme browser, update checks | |
| `https://raw.githubusercontent.com/<repo>/HEAD/{manifest.json,README.md,…}`, `https://github.com/<repo>/releases/download/<ver>/<file>` | renderer | browsing and installing plugins/themes | on a non-404 failure, retried through `https://releases.obsidian.md/proxy?url=<original>` (app.js:43043-43048) |
| `https://releases.obsidian.md/stats/theme` (GET), `…/stats/theme/<name>/download` (POST) | renderer | theme browser; **counts a download on first install** of each theme (app.js:45955) | usage counter, no id attached |
| `https://obsidian.md/changelog/desktop/<ver>.md` | renderer | Release-notes view | |
| `https://releases.obsidian.md/youtube?v=…` | renderer | YouTube embeds when the origin is not https (Electron) | proxy wrapper; otherwise `youtube-nocookie.com/embed` |
| `https://platform.twitter.com/embed/Tweet.html?dnt=true…` | renderer | tweet embeds | |
| `https://api.obsidian.md/*` | renderer (fetch) | account, vault, site management (§1) | |
| `wss://<vault host>` (must end `.obsidian.md`) | renderer | Sync | |
| `https://publish.obsidian.md/api/*`, `https://<site host>/api/*` | renderer | Publish | |
| `https://www.googletagmanager.com/gtag/js`, `https://www.google-analytics.com/analytics.js` | **published site only** | custom-domain site with an id configured | |
| `obsidian.md/{account,download,sync,auth#signup,…}`, `obsidian.md/help/*`, `community.obsidian.md/plugins/<id>`, search engines | opened in the system browser | user clicks | not fetched by the app |
| `mailto:support@obsidian.md` | user | "Email support" | debug info (system info, sync config, plugin list, last 20 log lines) is meant to go into the body, but the Sync tab builds `mailto:…obsidian.md/subject=…&body=…` with `/` where `?` belongs, so mail clients may not split out subject and body (observed quirk, app.js:135866); the same report can be copied instead (app.js:135838-135873, 51437-51454) |

No crash reporter or analytics SDK runs in the desktop app (observed: no Sentry, gtag or similar outside
`dJ`). Debug info only leaves through user-initiated copy or mailto.

## Data formats & on-disk files

| Location | Content |
|---|---|
| localStorage `obsidian-account` (global) | `{email, name, token, license, key}`, plaintext |
| IndexedDB `<appId>-sync` / store `data` / key `data` | Sync blob (§4), including the base64 master key |
| `<configDir>/publish.json` | `{siteId, host, included, excluded}`. Core-plugin `saveData` writes `<configDir>/<id>.json` through `vault.writeConfigJson` (app.js:110050-110069). As a top-level config JSON it falls in the Sync category `core-plugin-data`, so the Publish site binding syncs between devices (inferred from the filter) |
| localStorage `<site uid>` (on the published site's origin) | `hpw` site password token |
| localStorage `site-theme` (published site) | reader's theme toggle |
| localStorage `history-show-diff` | version-history diff toggle |
| localStorage `<appId>-secrets-encrypted`, `<appId>-secrets-meta` | SecretStorage (safeStorage ciphertext as base64; last-access times) |
| `%APPDATA%/obsidian/id` | 32-hex-character install id for the update ping |
| `%APPDATA%/obsidian/obsidian-<ver>.asar` | downloaded app updates |
| `%APPDATA%/obsidian/adblock/*.txt` | cached filter lists |
| `C:\Program Files\Obsidian\policy.json` (work edition) | feature policy |

Encrypted blob layouts: content = `IV(12) ‖ AES-GCM ct ‖ tag(16)`; v2/v3 deterministic string =
hex(`SIV(16) ‖ AES-CTR ct`); v0 deterministic string = hex(`SHA256(pt)[0:12] ‖ GCM ct ‖ tag(16)`).

## Rebuild notes (for a local-first app such as Neural Map)

**Worth copying:**
1. **Three-map reconciliation state** (local records, last-known server records, pending server events),
   with a server-assigned monotonic change `uid` as the only cursor. Reconnect sends "my last uid" and the
   server replays only newer events, then sends `ready`. It is simple, resumable, and needs no vector
   clocks when a single server orders all changes.
2. **"Unchanged since last sync" as the fast-forward test** (local hash equals the hash of the
   last-known server version). Merges happen only on true divergence, and the merge base is the server
   history entry of the last-known version. That needs server-side history, which you get from
   append-only change logs.
3. **One action per loop iteration**, with a short gap between actions. That gives simple state, natural
   back-pressure, and makes "what is the sync doing" observable. Order matters: apply remote first, wait
   for `ready`, then delete files longest-path-first, then upload folders shortest-path-first, then files
   smallest-first.
4. **Edit debounce by file size** (10/20/30 s) so files are not uploaded mid-typing, plus a re-stat right
   before writing a download so an in-flight local edit is never clobbered.
5. **Crypto shape:** a slow KDF makes a master key, HKDF with distinct `info` labels derives sub-keys, a
   keyhash proves the password, AES-GCM with a random nonce encrypts contents, and AES-SIV encrypts the
   identifiers that need equality on the server (paths, content hashes). For a new build, prefer Argon2id
   over scrypt and libsodium/`aes-gcm-siv` crates in Rust/Tauri.
6. **Safety rails:** pause when the vault is empty, confirm before merging into a non-empty vault, start
   sync paused after setup, keep a local backup before any overwrite or merge (File Recovery), and write
   conflict copies with device name and timestamp.
7. **Echo suppression** by remembering the last pushed record.
8. **Pin the server host** with captured natives, or in Tauri do the networking in Rust and allow-list
   hosts.

**Avoid or improve:**
- v0's unkeyed-hash IV leak. Do not ship deterministic encryption without a keyed IV.
- Plaintext metadata. Obsidian leaks extension, size, mtime and ctime. If it matters, pad sizes and put the
  extension and timestamps inside the encrypted envelope; the server needs only uid, opaque id and
  ciphertext length.
- The master key sits unprotected in IndexedDB and the account token in plaintext localStorage. Use the OS
  keychain (Tauri `keyring` / stronghold) for both.
- Merging with `diff_main(…, deadline 0)` (app.js:98758) skips Myers bisection, so diffs are coarse and
  merges can produce duplicated or garbled blocks on heavy concurrent edits. Use a line-based diff3
  (e.g. `diffy`/`similar` in Rust) and fall back to a conflict copy when hunks overlap.
- Last-writer-wins for structured JSON documents like canvas and base loses data. A field-level or
  CRDT-style merge (Automerge, Yjs, or a JSON-patch 3-way merge) is the natural upgrade, and essential if
  Neural Map stores graph or annotation JSON.
- The config JSON merge is shallow, so a nested object overwrites wholesale.
- The backoff jitter flag can never be disabled (`|| true`).

**Essential vs incidental:** essential are the change log with uid cursor, per-file hash, the three-map
state, the merge-base lookup, chunked binary transfer and keyhash auth. Incidental are the specific WS
JSON shapes, the 2 MiB chunk size, the 30 s poll (redundant with server push), regions, the
`standard`-mode server-held password, and the Publish site renderer, which is just the app bundle in
reader mode.

## Open questions

1. **What v3 changes compared with v2** on the server side. The client crypto is identical for both. A
   probe would be to compare `/vault/migrate` results, or watch WS traffic for a v2 vault and a v3 vault.
2. **Push response when the server needs the body.** The only observed branch is `res === "ok"` (skip);
   the other value is unknown. Server-side dedup semantics (does "ok" mean the same encrypted hash already
   exists at that path?) are inferred. A runtime WebSocket capture would settle it.
3. **Whether the `size` the server stores is ciphertext or plaintext.** The client sends ciphertext length
   (observed); history and quota displays may compensate.
4. **Publish metadata cache origin.** The upload sends only bytes, so the server must parse Markdown to
   build `/cache/<uid>`. Which parser it uses (a copy of `worker.js`?) is unknown.
5. **The `ts`/`sig` acceptance window** for password sites (the client's +6 h rounding and ~6-7 h reuse are
   observed; the server-side tolerance is unknown) and whether `hpw` is a hash of the password or an opaque token.
6. **The `existing` region value** set in the migrate modal (app.js:136647) is not among the client's
   options, so the server must supply it. Region names and hosts are unknown and come from the server.
7. **Sync status of `publish.json`.** By the filter rules it is `core-plugin-data`, so it would sync. This
   is not confirmed at runtime.
8. **Whether the server enforces `extension`** (e.g. type limits per plan). The client sends it in
   plaintext with every push. Unknown.
