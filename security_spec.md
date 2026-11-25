# Security Specification & Payload-First TDD (`kakumiro-online-tv-16648`)

## 1. Data Invariants
1. **Admin Authority (`isAdmin`)**: Only verified users (`request.auth.token.email_verified == true`) whose email is the bootstrapped station admin (`97.1skyfm@gmail.com`) or whose UID exists in `/admins/{uid}` may create, update, or delete broadcast catalog documents (`/channels`, `/guideSlots`, `/heroSlides`, `/movies`, `/archiveItems`, `/settings/promo`, `/settings/appConfig`) or purge other users' chat messages when stream URLs change.
2. **Sender & Owner Integrity**: A viewer creating a chat message in `/chatMessages/{messageId}` must be authenticated, email-verified, and set `senderId == request.auth.uid`, `likes == 0`, and `serverCreatedAt == request.time`, while referencing an existing parent channel in `/channels/{channelId}`.
3. **Strict Action-Based Updates on Chat**: Authenticated viewers may ONLY increment/decrement `likes` by `+/- 1` via `affectedKeys().hasOnly(['likes'])`; they cannot rewrite another viewer's `text`, `senderId`, or `serverCreatedAt`.
4. **PII Isolation (Split Collection)**: Private user PII (`email`, `identifier`) lives strictly in `/users/{userId}/private/info` and is readable/writable ONLY by the owning `userId` or an admin — never via blanket `isSignedIn()` reads or list queries (`allow list: if false`). Non-PII preferences live in `/users/{userId}` with owner-only mutations (`isOwner(userId)`), admin directory listing (`isAdmin()`), and zero client-writable `role`/`isAdmin` privilege fields.
5. **Path ID & Volumetric Bounds**: All document IDs (`channelId`, `slideId`, `movieId`, `itemId`, `messageId`, `userId`, `fileId`, `backupId`) match `^[a-zA-Z0-9_\-]+$` with length `<= 128`. All strings and bounded arrays (`favorites <= 100`, `reminders <= 200`, `followedSenders <= 200`) enforce explicit `.size()` ceilings.
6. **Cloud Storage Metadata & Vault Chunks**: `/cloudFiles/{fileId}` and `/cloudFiles/{fileId}/chunks/{chunkId}` enforce `isAdmin()` + `uploadedByUid == request.auth.uid` + `serverCreatedAt == request.time` on creation, preventing non-admin file injection or payload overflow (`url <= 650000`, chunk `data <= 650000`).
7. **Immutable Admin-Only Backups**: `/backups/{backupId}` enforces `isAdmin()` on get/list/create/delete, `createdByUid == request.auth.uid`, `serverCreatedAt == request.time`, and `allow update: if false` so backup snapshots remain tamper-proof and inaccessible to unauthenticated or viewer accounts.
8. **Personal User Cloud Backups & Private Cloud Files**: `/users/{userId}/backups/{backupId}` and `/users/{userId}/cloudFiles/{fileId}` enforce strict owner isolation (`isOwner(userId)` + `uid == request.auth.uid` + `resource.data.uid == request.auth.uid` on list), immutable snapshots (`allow update: if false`), and strict field/size limits.
9. **Immutable Authentication Audit Log**: `/userLogins/{loginId}` records non-PII login and sign-up events (`id`, `uid`, `displayName`, `eventType`, `provider`, `platform`, `createdAt`, `timestampMs`, `serverCreatedAt`), enforces `uid == request.auth.uid`, `serverCreatedAt == request.time`, `allow update: if false`, and restricts full directory listing to `isAdmin()`.

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)

1. **Identity Spoofing in Chat Creation** (`/chatMessages/msg-spoof-1`, unprivileged user `uid: "viewer-1"`):
   ```json
   {
     "id": "msg-spoof-1",
     "channelId": "sanyuka-tv",
     "streamKey": "sanyuka-tv::channel",
     "senderId": "victim-uid-999",
     "senderName": "Station Host",
     "text": "Fake announcement",
     "createdAt": "Just now",
     "timestampMs": 1794720000000,
     "likes": 0,
     "serverCreatedAt": "<REQUEST_TIME>"
   }
   ```
   *Expected*: Denied because `senderId !== request.auth.uid`.

2. **Shadow Field Injection on User Profile** (`/users/viewer-1`, user `uid: "viewer-1"`):
   ```json
   {
     "uid": "viewer-1",
     "displayName": "Viewer",
     "plan": "Free",
     "favorites": [],
     "reminders": [],
     "followedSenders": [],
     "settings": { "autoplay": true, "dataSaver": false, "rememberLastChannel": true },
     "updatedAt": "<REQUEST_TIME>",
     "role": "admin",
     "isAdmin": true
   }
   ```
   *Expected*: Denied because `keys().hasOnly(...)` rejects undeclared RBAC ghost fields (`role`, `isAdmin`).

3. **Email Spoofing Attack (`email_verified: false`)** (`/channels/hacked-ch`, token `{ email: "97.1skyfm@gmail.com", email_verified: false }`):
   ```json
   {
     "id": "hacked-ch",
     "name": "Hijacked TV",
     "type": "Television",
     "subtitle": "Hacked",
     "brand": "default",
     "progress": 50,
     "program": "Hijacked"
   }
   ```
   *Expected*: Denied because `isAdmin()` mandates `request.auth.token.email_verified == true`.

4. **PII Cross-User Read Attack** (`GET /users/victim-uid/private/info` as `uid: "attacker-uid"`):
   *Expected*: Denied because `isOwner(userId)` fails and user is not admin.

5. **Non-Admin Catalog Tampering** (`UPDATE /channels/sanyuka-tv` as `uid: "viewer-1"`):
   ```json
   {
     "streamUrl": "https://evil.example/stream.m3u8"
   }
   ```
   *Expected*: Denied because only `isAdmin()` can mutate `/channels`.

6. **Chat Message Text Tampering via Update** (`UPDATE /chatMessages/msg-1` as `uid: "viewer-2"`, message owned by `"viewer-1"`):
   ```json
   {
     "text": "Edited someone else's chat message",
     "likes": 1
   }
   ```
   *Expected*: Denied because non-admin updates only allow `affectedKeys().hasOnly(['likes'])` with delta `+/- 1`.

7. **Chat Like Inflation Attack** (`UPDATE /chatMessages/msg-1` as `uid: "viewer-2"` where existing `likes == 3`):
   ```json
   {
     "likes": 9999
   }
   ```
   *Expected*: Denied because `(incoming().likes == existing().likes + 1 || incoming().likes == existing().likes - 1)` fails.

8. **Orphaned Chat Message Without Parent Channel** (`CREATE /chatMessages/msg-orphan` as `uid: "viewer-1"`):
   ```json
   {
     "id": "msg-orphan",
     "channelId": "nonexistent-channel-xyz",
     "streamKey": "nonexistent-channel-xyz::channel",
     "senderId": "viewer-1",
     "senderName": "Viewer",
     "text": "Hello",
     "createdAt": "Just now",
     "timestampMs": 1794720000000,
     "likes": 0,
     "serverCreatedAt": "<REQUEST_TIME>"
   }
   ```
   *Expected*: Denied because `exists(/databases/$(database)/documents/channels/$(incoming().channelId))` fails.

9. **Path ID Poisoning Injection** (`CREATE /movies/../../admin$bad_id!` as admin):
   *Expected*: Denied because `isValidId(movieId)` rejects non-`[a-zA-Z0-9_\-]` characters and oversized IDs.

10. **Client-Spoofed Timestamp on Chat Creation** (`/chatMessages/msg-backdate` as `uid: "viewer-1"`):
    ```json
    {
      "id": "msg-backdate",
      "channelId": "sanyuka-tv",
      "streamKey": "sanyuka-tv::channel",
      "senderId": "viewer-1",
      "senderName": "Viewer",
      "text": "Backdated",
      "createdAt": "Just now",
      "timestampMs": 1794720000000,
      "likes": 0,
      "serverCreatedAt": "2020-01-01T00:00:00.000Z"
    }
    ```
    *Expected*: Denied because `incoming().serverCreatedAt == request.time`.

11. **Oversized Array Resource Exhaustion (Denial of Wallet)** (`UPDATE /users/viewer-1` as `uid: "viewer-1"`):
    ```json
    {
      "favorites": ["ch-1", "... 150 items ..."]
    }
    ```
    *Expected*: Denied because `favorites.size() <= 100`.

12. **Self-Assigned Admin Escalation** (`CREATE /admins/viewer-1` as `uid: "viewer-1"`):
    ```json
    {
      "uid": "viewer-1",
      "email": "attacker@example.com",
      "grantedAt": "<REQUEST_TIME>"
    }
    ```
    *Expected*: Denied because `/admins/{userId}` can only be written by an existing verified admin.

13. **Cross-User Personal Backup Read** (`LIST /users/victim-uid/backups` as `uid: "attacker-uid"`):
    *Expected*: Denied because `isOwner(userId)` fails.

14. **Cross-User Personal Cloud File Injection** (`CREATE /users/victim-uid/cloudFiles/f-1` as `uid: "attacker-uid"`):
    *Expected*: Denied because `isOwner(userId)` and `incoming().uid == request.auth.uid` fail.

15. **Identity Spoofing in User Login Event** (`CREATE /userLogins/login-spoof-1` as `uid: "attacker-uid"` with `uid: "victim-uid"`):
    *Expected*: Denied because `incoming().uid == request.auth.uid` fails.

16. **Unauthorized Login Directory Enumeration** (`LIST /userLogins` unfiltered as non-admin `uid: "viewer-1"`):
    *Expected*: Denied because non-admins can only query where `resource.data.uid == request.auth.uid`.
