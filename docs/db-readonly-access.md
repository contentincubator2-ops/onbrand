# Prod DB 唯讀直連（SSH tunnel）

建立於 2026-08-19。用途：從本機用 GUI client（TablePlus 等）互動式查詢 prod `mos_db`，
取代「每問一個問題就開一支 `ops-*.yml` workflow」的流程。

**這條路徑是唯讀的，權限層強制，不是靠約定。**

---

## 1. 為什麼是這個設計

prod MySQL 綁在 `127.0.0.1`，NSG 沒開 3306，所以本機不可能直連。可行的路只有兩條：

| 方案 | 問題 |
|---|---|
| `az vm run-command` 直接跑 `mysql` | 以 **root** 執行，拿到的是 MySQL root。打錯一個 `DELETE` 就真的執行。每次 invoke 十幾秒，輸出會截斷，SQL 要穿過四層 shell 跳脫 |
| **SSH tunnel + 唯讀帳號**（本文件） | 一次性設定，之後互動式使用。權限層擋死寫入 |

選後者。3306 維持不對外開放，資料流是：

```
本機 client → SSH(22) → VM 上的 sshd → 127.0.0.1:3306 → MySQL
                         ↑ 這把金鑰只准轉發到 3306，開不了 shell
```

---

## 2. 元件

| 元件 | 內容 | 說明 |
|---|---|---|
| VM | `a2a-marketing-os` / RG `A2A-MARKETING-OS_GROUP` / `48.217.67.103` | `onbrand.sowork.ai` 指向此 IP |
| Unix 帳號 | `dbtunnel` | `shell=/usr/sbin/nologin`、密碼鎖定、不在任何 sudo group |
| 金鑰限制 | `restrict,port-forwarding,permitopen="127.0.0.1:3306"` | `restrict` 關掉全部功能，再只開回 port forwarding 並限死目標埠 |
| DB 帳號 | `mos_ro@127.0.0.1` + `mos_ro@localhost` | `USAGE` + `SELECT ON mos_db.*`，`MAX_USER_CONNECTIONS 3` |
| 本機金鑰 | `~/.ssh/onbrand-tunnel` | 每台機器各自產生，私鑰不外流 |

建兩筆 `mos_ro` 是因為 tunnel 進來的是 TCP from `127.0.0.1`，能不能匹配 `@localhost`
取決於 `skip_name_resolve`，建兩筆一次到位。

**不觸碰**：`azureuser` / `root` 的 `authorized_keys`、`sshd_config`、NSG、`mos_user`、`mos_db` 任何資料。

---

## 3. 建立（新機器只需做 3.1；首次建置才需要 3.2）

### 3.1 本機產生金鑰

```bash
ssh-keygen -t ed25519 -f ~/.ssh/onbrand-tunnel -N "" -C "onbrand-db-tunnel"
```

### 3.2 在 VM 上建立帳號

把下列腳本存成 `create-db-access.sh`，然後：

```bash
az vm run-command invoke \
  -g A2A-MARKETING-OS_GROUP -n a2a-marketing-os \
  --command-id RunShellScript \
  --scripts @create-db-access.sh \
  --parameters "keybody=$(awk '{print $2}' ~/.ssh/onbrand-tunnel.pub)" \
  --query "value[0].message" -o tsv
```

> **為什麼只傳公鑰的第二欄**：`--parameters` 會被組成**未加引號**的 `export name=value`
> 塞進腳本開頭。公鑰含空格，整串傳會讓 `export` 把註解欄當成變數名而報
> `not a valid identifier`。只傳無空格的本體，型別與註解由腳本補回。

```bash
#!/bin/bash
set -euo pipefail

KEYBODY="${keybody:-}"
case "$KEYBODY" in
  AAAAC3NzaC1lZDI1NTE5*) ;;
  *) echo "ERROR: keybody 必須是 ed25519 公鑰本體"; exit 1 ;;
esac
PUBKEY="ssh-ed25519 $KEYBODY onbrand-db-tunnel"

# 1. tunnel-only Unix 帳號
if ! id dbtunnel >/dev/null 2>&1; then
  useradd --create-home --home-dir /home/dbtunnel --shell /usr/sbin/nologin dbtunnel
fi
passwd -l dbtunnel >/dev/null 2>&1 || true

install -d -m 700 -o dbtunnel -g dbtunnel /home/dbtunnel/.ssh
AK=/home/dbtunnel/.ssh/authorized_keys
touch "$AK"
LINE="restrict,port-forwarding,permitopen=\"127.0.0.1:3306\" $PUBKEY"
grep -qF "$KEYBODY" "$AK" || printf '%s\n' "$LINE" >> "$AK"
chown dbtunnel:dbtunnel "$AK"; chmod 600 "$AK"
sudo -l -U dbtunnel 2>&1 | tail -1 || true

# 2. 唯讀 MySQL 帳號
# 注意：不要用 `tr ... | head -c N` 產密碼。head 提前結束會讓 tr 收到 SIGPIPE，
# 配上 set -o pipefail + set -e 會讓腳本「靜默」中止，stderr 完全沒有訊息。
PW=$(openssl rand -hex 24)

mysql <<SQL
CREATE USER IF NOT EXISTS 'mos_ro'@'127.0.0.1' IDENTIFIED BY '${PW}';
ALTER  USER 'mos_ro'@'127.0.0.1' IDENTIFIED BY '${PW}' WITH MAX_USER_CONNECTIONS 3;
GRANT SELECT ON mos_db.* TO 'mos_ro'@'127.0.0.1';
CREATE USER IF NOT EXISTS 'mos_ro'@'localhost' IDENTIFIED BY '${PW}';
ALTER  USER 'mos_ro'@'localhost' IDENTIFIED BY '${PW}' WITH MAX_USER_CONNECTIONS 3;
GRANT SELECT ON mos_db.* TO 'mos_ro'@'localhost';
FLUSH PRIVILEGES;
SQL

mysql -N -e "SHOW GRANTS FOR 'mos_ro'@'127.0.0.1'"
ssh-keyscan -t ed25519 127.0.0.1 2>/dev/null | sed "s|^127.0.0.1|48.217.67.103|"
echo "mos_ro 密碼: $PW"   # 只顯示這一次；重跑腳本即可換發
```

腳本冪等，重跑只會重設密碼。密碼存密碼管理器，**不要寫進這個 repo 或任何 `.env`**。

### 3.3 Pin host key

```bash
ssh-keyscan -t ed25519 48.217.67.103 >> ~/.ssh/known_hosts
```

務必跟腳本第 3 段的輸出比對一致。不要用 `StrictHostKeyChecking=no`。

---

## 4. TablePlus 設定（建議）

TablePlus 內建 SSH tunnel，不需要手動開通道。

**MySQL 分頁**

| 欄位 | 值 |
|---|---|
| Host | `127.0.0.1` |
| Port | `3306` |
| User | `mos_ro` |
| Password | 密碼管理器裡那組 |
| Database | `mos_db` |

**Over SSH 分頁**

| 欄位 | 值 |
|---|---|
| Server | `48.217.67.103` |
| Port | `22` |
| User | `dbtunnel` |
| Private Key | `~/.ssh/onbrand-tunnel` |
| Password / Passphrase | 留空 |

### 兩個踩雷點

1. **Host 必須是 `127.0.0.1`，不能是 `localhost`。**
   `permitopen` 是字串比對，sshd 不做 DNS 解析。填 `localhost` 會被當成未授權目標拒絕。

2. **走 TablePlus 內建 tunnel 時 Port 是 `3306` 不是 `3307`。**
   那個 Host/Port 是「從 VM 的角度」看出去的。`3307` 只在手動 `ssh -N` 時才用到。

另外建議把這條連線在 TablePlus 裡標成 **Read-only mode** — client 端多一層保護。

---

## 5. CLI 用法（不用 TablePlus 時）

`~/.ssh/config`：

```
Host onbrand-db
    HostName             48.217.67.103
    User                 dbtunnel
    IdentityFile         ~/.ssh/onbrand-tunnel
    IdentitiesOnly       yes
    LocalForward         127.0.0.1:3307 127.0.0.1:3306
    ExitOnForwardFailure yes
    StrictHostKeyChecking yes
    RequestTTY           no
    ServerAliveInterval  30
    ServerAliveCountMax  3
```

```bash
ssh -N onbrand-db                    # 開通道（前景）
ssh -f -N onbrand-db                 # 開通道（背景）
pkill -f "ssh.*onbrand-db"           # 關閉
mysql -h 127.0.0.1 -P 3307 -u mos_ro -p mos_db
```

---

## 6. 驗證

連上後跑：

```sql
SELECT CURRENT_USER(), USER();
-- 預期 CURRENT_USER() = mos_ro@127.0.0.1

UPDATE users SET id = id WHERE 1 = 0;
-- 預期 ERROR 1142: UPDATE command denied to user 'mos_ro'
```

第二個查詢用 `WHERE 1 = 0`，就算權限沒擋住也改不到任何一筆。
**如果它沒報錯，代表授權有問題，立刻收緊。**

建置當下已實測通過的項目：

- `dbtunnel` 無 sudo（`sudo -l -U dbtunnel` → `is not allowed to run sudo`）
- 開 shell 被拒（`ssh onbrand-db whoami` → `This account is currently not available.`）
- `permitopen` 生效：轉發 VM 的 22 埠時本機收不到任何 banner；同樣讀法在 3307 拿得到
  `8.0.46-0ubuntu0.24.04.3`
- 授權僅 `USAGE ON *.*` + `SELECT ON mos_db.*`

> 驗證轉發限制時**不能**用 `nc -z` 測本機埠。`-L` 的 listener 是本機 ssh client 開的，
> 不管遠端准不准都會 bind 成功；要看實際資料流（有沒有收到 banner）才算數。

---

## 7. 撤銷

```bash
az vm run-command invoke -g A2A-MARKETING-OS_GROUP -n a2a-marketing-os \
  --command-id RunShellScript --scripts '
    userdel -r dbtunnel
    mysql -e "DROP USER IF EXISTS \"mos_ro\"@\"127.0.0.1\", \"mos_ro\"@\"localhost\";"
  ' --query "value[0].message" -o tsv
```

（MySQL 預設 `sql_mode` 下雙引號是字串常值，所以這樣寫可以避開單引號嵌套。）

人員異動或筆電遺失時，撤銷這兩個帳號即可，不影響 app（app 用的是 `mos_user`）。

---

## 8. 安全邊界

**這條路徑做不到的事**（權限層強制，非約定）：

- 寫入任何資料 — 只有 `SELECT`
- 取得鎖 — MySQL 8 的 `SELECT ... FOR UPDATE` 需要額外的 UPDATE/DELETE/LOCK TABLES 權限
- 在 VM 上開 shell 或執行任何指令 — `nologin` + `restrict`
- 轉發 3306 以外的任何埠 — `permitopen`
- 提權 — 不在任何 sudo group

**仍然要注意的**：

- `mos_ro` 讀得到 `mos_db` **全部**的表，包含 `users`、`user_api_keys`、`subscriptions`、
  `token_usage_logs`。這組憑證等同於能讀取全部客戶資料，請當成正式憑證保管。
- 唯讀不等於零影響。大表全掃、`SLEEP()`、`BENCHMARK()` 一樣吃 CPU/IO，而 app 跑在同一台 VM。
  `MAX_USER_CONNECTIONS 3` 限制了併發，但查詢本身仍請自己加 `LIMIT`。
- 寫入操作**仍然**走既有的 `admin-*.yml` workflow，不要用這條路徑。

---

## 9. 建置時順帶發現的待辦

與本文件無關，但值得處理：

1. **`root` 有一把 `authorized_key`，且 `permitrootlogin without-password`** —
   有人能用金鑰直接以 root 身分 SSH 進 prod。該確認那把 key 屬於誰、是否還需要。
2. **`.github/workflows/ops-read-brand-full.yml:21` 有 SQL injection** —
   `brandId` 直接串進 SQL。同樣模式可能散在其他 `ops-*.yml`。
3. **`docs/engineer-handoff-2026-05-11.md` 內含明文 DB 密碼**（repo 為 private，
   但仍留在 git history）。若該密碼尚未輪替，應執行 `admin-rotate-db-password.yml`。
4. `docs/engineer-handoff-2026-05-11.md:127` 寫的 SSH 使用者 `azureus` 是錯的，
   實際是 `azureuser`。
