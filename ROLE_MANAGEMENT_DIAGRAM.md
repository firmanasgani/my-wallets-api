# Business Role Management — Diagram & Flowchart

> Referensi visual untuk implementasi Phase 2: Multi-user & Role Management.
> Berdasarkan `BUSINESS_MVP_PLAN.md`.

---

## 1. Hierarki Role

```
OWNER  (level 3) ──── Full access + hapus company
  │
ADMIN  (level 2) ──── Full access kecuali hapus company
  │
STAFF  (level 1) ──── Buat invoice, input transaksi
  │
VIEWER (level 0) ──── Read-only
```

```mermaid
graph TD
    OWNER["👑 OWNER\n(Level 3)"]
    ADMIN["🛡️ ADMIN\n(Level 2)"]
    STAFF["✏️ STAFF\n(Level 1)"]
    VIEWER["👁️ VIEWER\n(Level 0)"]

    OWNER -->|"can do everything\nADMIN can do"| ADMIN
    ADMIN -->|"can do everything\nSTAFF can do"| STAFF
    STAFF -->|"can do everything\nVIEWER can do"| VIEWER

    style OWNER fill:#7c3aed,color:#fff,stroke:#5b21b6
    style ADMIN fill:#2563eb,color:#fff,stroke:#1d4ed8
    style STAFF fill:#059669,color:#fff,stroke:#047857
    style VIEWER fill:#6b7280,color:#fff,stroke:#4b5563
```

---

## 2. Permission Matrix

| Aksi | OWNER | ADMIN | STAFF | VIEWER |
|------|:-----:|:-----:|:-----:|:------:|
| Lihat data company | ✅ | ✅ | ✅ | ✅ |
| Lihat list members | ✅ | ✅ | ✅ | ✅ |
| Invite member | ✅ | ✅ | ❌ | ❌ |
| Update role member | ✅ | ❌ | ❌ | ❌ |
| Revoke STAFF / VIEWER | ✅ | ✅ | ❌ | ❌ |
| Revoke ADMIN | ✅ | ❌ | ❌ | ❌ |
| Revoke OWNER | ❌ | ❌ | ❌ | ❌ |
| Update profil company | ✅ | ✅ | ❌ | ❌ |
| Hapus company | ✅ | ❌ | ❌ | ❌ |
| Buat / edit invoice | ✅ | ✅ | ✅ | ❌ |
| Input transaksi bisnis | ✅ | ✅ | ✅ | ❌ |
| Lihat laporan keuangan | ✅ | ✅ | ✅ | ✅ |
| Lihat KPI dashboard | ✅ | ✅ | ✅ | ✅ |

---

## 3. Invite Flow (End-to-End)

```mermaid
sequenceDiagram
    actor Owner as Owner / Admin
    participant API as POST /business/members/invite
    participant DB as Database
    participant Email as Resend (Email)
    actor Invitee as Invitee

    Owner->>API: { email, role }
    API->>API: Cek inviter role ≥ ADMIN
    API->>DB: Cek jumlah member (ACTIVE + PENDING)

    alt Sudah 5 members
        API-->>Owner: 400 Max 5 members reached
    end

    API->>DB: Cari user by email
    alt Email belum terdaftar
        API-->>Owner: 404 User not found — must register first
    end

    alt Invite diri sendiri
        API-->>Owner: 400 Cannot invite yourself
    end

    API->>DB: Cek apakah sudah member (ACTIVE / PENDING)
    alt Sudah ACTIVE
        API-->>Owner: 400 Already an active member
    end
    alt Sudah PENDING
        API-->>Owner: 400 Already has a pending invitation
    end

    API->>DB: Upsert CompanyMember\nstatus=PENDING\ntoken=hex(32)\nexpires=now+30min
    API->>Email: Kirim invitation email\nberisi accept link + token
    API-->>Owner: 201 Invitation sent ✅

    Email-->>Invitee: Email berisi tombol "Accept Invitation"
    Invitee->>API: POST /business/members/accept\n{ token }
    API->>DB: Cari CompanyMember by token
    alt Token tidak ditemukan
        API-->>Invitee: 404 Invalid token
    end
    alt userId tidak cocok
        API-->>Invitee: 403 Invitation not for your account
    end
    alt Token expired (> 30 menit)
        API-->>Invitee: 400 Token expired
    end
    API->>DB: Update status=ACTIVE\njoinedAt=now\nclear token
    API-->>Invitee: 200 Joined company ✅
```

---

## 4. Status Lifecycle: CompanyMember

```mermaid
stateDiagram-v2
    [*] --> PENDING : POST /invite\n(token digenerate)

    PENDING --> ACTIVE : POST /accept\n(token valid & belum expired)
    PENDING --> REVOKED : DELETE /members/:id\n(OWNER / ADMIN)
    PENDING --> PENDING : POST /invite (ulang)\n(token di-reset, timer 30 mnt dimulai lagi)

    ACTIVE --> REVOKED : DELETE /members/:id\n(OWNER atau ADMIN jika target ≤ STAFF)
    ACTIVE --> ACTIVE : PUT /members/:id/role\n(OWNER mengubah role)

    REVOKED --> PENDING : POST /invite (ulang)\n(upsert — bisa diundang kembali)

    ACTIVE --> [*] : User dihapus akunnya\n(Cascade delete)
    PENDING --> [*] : User dihapus akunnya\n(Cascade delete)
    REVOKED --> [*] : Company dihapus\n(Cascade delete)
```

---

## 5. Update Role — Aturan & Batasan

```mermaid
flowchart TD
    A([OWNER memanggil\nPUT /members/:id/role]) --> B{Invokser adalah OWNER?}
    B -- Tidak --> ERR1[403 Forbidden\nOnly OWNER can update roles]
    B -- Ya --> C{Target member ditemukan\ndi company ini?}
    C -- Tidak --> ERR2[404 Not Found]
    C -- Ya --> D{Target adalah diri sendiri?}
    D -- Ya --> ERR3[400 Cannot change your own role]
    D -- Tidak --> E{Target role = OWNER?}
    E -- Ya --> ERR4[400 Cannot change OWNER's role]
    E -- Tidak --> F{Status target = REVOKED?}
    F -- Ya --> ERR5[400 Cannot update revoked member]
    F -- Tidak --> G[✅ Update role berhasil\nLog: BUSINESS_MEMBER_ROLE_UPDATE]

    style ERR1 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR3 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR4 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR5 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style G fill:#bbf7d0,stroke:#22c55e,color:#14532d
```

---

## 6. Revoke Member — Aturan & Batasan

```mermaid
flowchart TD
    A([ADMIN/OWNER memanggil\nDELETE /members/:id]) --> B{Invoker role ≥ ADMIN?}
    B -- Tidak --> ERR1[403 Forbidden]
    B -- Ya --> C{Target ditemukan\ndi company ini?}
    C -- Tidak --> ERR2[404 Not Found]
    C -- Ya --> D{Target role = OWNER?}
    D -- Ya --> ERR3[400 Cannot revoke OWNER]
    D -- Tidak --> E{Target adalah diri sendiri?}
    E -- Ya --> ERR4[400 Cannot revoke yourself]
    E -- Tidak --> F{Invoker = ADMIN\ndan target = ADMIN?}
    F -- Ya --> ERR5[403 ADMIN cannot revoke another ADMIN]
    F -- Tidak --> G{Status target\nalready REVOKED?}
    G -- Ya --> ERR6[400 Already revoked]
    G -- Tidak --> H[✅ Revoke berhasil\nstatus → REVOKED\ntoken cleared\nLog: BUSINESS_MEMBER_REVOKE]

    style ERR1 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR2 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR3 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR4 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR5 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style ERR6 fill:#fca5a5,stroke:#ef4444,color:#7f1d1d
    style H fill:#bbf7d0,stroke:#22c55e,color:#14532d
```

---

## 7. Batasan Kapasitas Member

```
Slot member per company: 5 (termasuk OWNER)

Contoh:
┌─────────────────────────────────────┐
│  Slot 1 │ OWNER  │ Ahmad (ACTIVE)   │
│  Slot 2 │ ADMIN  │ Budi  (ACTIVE)   │
│  Slot 3 │ STAFF  │ Cici  (ACTIVE)   │
│  Slot 4 │ VIEWER │ Deni  (PENDING)  │ ← belum accept, tetap hitung slot
│  Slot 5 │ —      │ (kosong)         │
└─────────────────────────────────────┘
  REVOKED tidak dihitung → bisa diundang ulang
```

---

## 8. Invite Token Lifecycle

```
POST /invite
    │
    ▼
Generate token = crypto.randomBytes(32).toString('hex')  → 64 char hex string
Set  expiresAt = now() + 30 minutes
    │
    ▼
Simpan ke CompanyMember.inviteToken (unique index)
    │
    ▼
Kirim email → link: {FRONTEND_URL}/business/invite/accept?token={token}
    │
    ▼
┌─────────────────────────────────────────────────┐
│  Token valid?  Cek: expiresAt > now()           │
│                Cek: member.userId == JWT user   │
│                Cek: status == PENDING           │
└─────────────────────────────────────────────────┘
    │                       │
  Valid                  Expired / Invalid
    │                       │
    ▼                       ▼
status = ACTIVE          400 / 403 / 404
joinedAt = now()
inviteToken = null        ← token di-clear setelah accept
inviteTokenExpiresAt = null
```

---

*End of Document — Phase 2 Reference — v1.0 — 2026-03-19*
