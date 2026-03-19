# Business Plan - Phase 2 API Documentation

> **Multi-user & Role Management**
>
> Dokumen ini berisi spesifikasi lengkap API untuk Fase 2 yang harus diimplementasikan di sisi frontend.
> Baca dokumen Phase 1 (`FRONTEND_API_DOCS_PHASE_1.md`) terlebih dahulu sebelum dokumen ini.

---

## Base Setup & Autentikasi

Sama seperti Phase 1:

1. Semua endpoint memerlukan header `Authorization: Bearer <token>`.
2. Akses ke modul Business diizinkan jika **salah satu** kondisi berikut terpenuhi:
   - User memiliki subscription aktif sendiri (`BUSINESS_1M`, `BUSINESS_6M`, atau `BUSINESS_12M`) — biasanya **OWNER**
   - **ATAU** user adalah member aktif (`ACTIVE`) di company yang OWNER-nya memiliki subscription Business aktif — berlaku untuk **ADMIN / STAFF / VIEWER** yang diundang
   - Pengecualian: `POST /business/members/accept` hanya butuh JWT (tidak cek subscription)
3. Untuk endpoint yang membutuhkan keanggotaan company, user harus sudah join company (status `ACTIVE`).
4. Tangani HTTP `403 Forbidden` secara global untuk redirect ke halaman **Upgrade Plan** — **kecuali** jika user adalah member yang diundang (mereka tidak perlu upgrade, cukup hubungi admin company).

---

## Ringkasan Endpoint Phase 2

| Method | Endpoint | Role Minimum | Keterangan |
|--------|----------|:------------:|------------|
| `GET` | `/business/members` | `VIEWER` | List semua member |
| `POST` | `/business/members/invite` | `ADMIN` | Undang user baru via email |
| `POST` | `/business/members/accept` | *(JWT only)* | Terima undangan lewat token |
| `PUT` | `/business/members/:id/role` | `OWNER` | Ubah role member |
| `DELETE` | `/business/members/:id` | `ADMIN` | Cabut akses member |

---

## 1. List Members

Mengambil daftar semua member company yang berstatus `ACTIVE` atau `PENDING`.
Member dengan status `REVOKED` **tidak** ditampilkan.

- **Endpoint:** `GET /business/members`
- **Role minimum:** `VIEWER`
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "companyId": "uuid",
      "userId": "uuid",
      "role": "OWNER",
      "status": "ACTIVE",
      "invitedAt": "2026-03-19T10:00:00.000Z",
      "joinedAt": "2026-03-19T10:05:00.000Z",
      "createdAt": "2026-03-19T10:00:00.000Z",
      "updatedAt": "2026-03-19T10:05:00.000Z",
      "user": {
        "id": "uuid",
        "email": "ahmad@example.com",
        "username": "ahmad",
        "fullName": "Ahmad Santoso",
        "profilePicture": "https://..."
      }
    },
    {
      "id": "uuid",
      "companyId": "uuid",
      "userId": "uuid",
      "role": "STAFF",
      "status": "PENDING",
      "invitedAt": "2026-03-19T11:00:00.000Z",
      "joinedAt": null,
      "user": {
        "id": "uuid",
        "email": "budi@example.com",
        "username": "budi",
        "fullName": "Budi Hartono",
        "profilePicture": null
      }
    }
  ]
  ```

**Catatan frontend:**
- `joinedAt: null` berarti member belum menerima undangan (`PENDING`).
- Gunakan field `status` untuk membedakan tampilan badge member aktif vs. menunggu.
- Urutkan tampilan: `OWNER` → `ADMIN` → `STAFF` → `VIEWER`, lalu `PENDING` di paling bawah.

---

## 2. Invite Member

Mengundang user ke company via email. Sistem menangani dua skenario berdasarkan status registrasi invitee.

- **Endpoint:** `POST /business/members/invite`
- **Role minimum:** `ADMIN`
- **Request Body:**
  ```json
  {
    "email": "string",   // Wajib — email yang akan diundang
    "role": "string"     // Wajib — salah satu: "ADMIN" | "STAFF" | "VIEWER"
  }
  ```

**Skenario A — Email belum terdaftar di Moneytory:**
Sistem mengirim email ajakan untuk mendaftar terlebih dahulu. **Slot member tidak terisi** karena belum ada akun.
- **Response (201 Created):**
  ```json
  {
    "message": "budi@example.com is not registered yet. A registration invitation email has been sent.",
    "memberId": null
  }
  ```

**Skenario B — Email sudah terdaftar & eligible:**
Sistem mengirim email undangan berisi link token berumur **30 menit**. Slot member langsung terisi (`PENDING`).
- **Response (201 Created):**
  ```json
  {
    "message": "Invitation sent to budi@example.com. The invite link will expire in 30 minutes.",
    "memberId": "uuid"
  }
  ```

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Company sudah mencapai batas 5 member |
| `400` | Mengundang diri sendiri |
| `400` | User sudah menjadi member aktif (`ACTIVE`) |
| `400` | User sudah memiliki undangan yang menunggu (`PENDING`) |
| `400` | User memiliki subscription **Premium** atau **Business** yang aktif — tidak bisa diundang |
| `403` | Role pemanggil di bawah `ADMIN` |

**Syarat user yang bisa diundang:**
- **Belum terdaftar** → bisa diundang (dikirim email ajakan daftar)
- **Terdaftar, FREE atau tanpa subscription aktif** → bisa diundang (invite normal dengan token)
- **Terdaftar, PREMIUM/BUSINESS aktif** → **tidak bisa** diundang

**Catatan frontend:**
- Cek `memberId` di response: `null` artinya email belum terdaftar (Skenario A), ada UUID artinya invite berhasil penuh (Skenario B).
- Untuk Skenario A, tampilkan info: *"Email belum terdaftar. Kami sudah kirimkan email ajakan untuk mendaftar. Setelah mereka daftar, undang kembali via halaman ini."*
- Untuk error `400` terkait subscription, tampilkan: *"User ini sudah memiliki paket Premium/Business aktif dan tidak dapat diundang sebagai member."*
- Setelah invite Skenario B berhasil, refresh list member untuk menampilkan member baru dengan badge `PENDING`.
- Role `OWNER` tidak bisa diassign saat invite — pilihan hanya `ADMIN`, `STAFF`, `VIEWER`.
- **Batas 5 member** hanya terisi oleh member `ACTIVE` atau `PENDING` (Skenario B). Skenario A tidak mengurangi slot.

---

## 3. Accept Invite (Terima Undangan)

Endpoint ini dipanggil oleh **penerima undangan** setelah mengklik link di email. Token didapat dari query param URL email undangan.

- **Endpoint:** `POST /business/members/accept`
- **Guard:** JWT saja — **tidak** butuh subscription bisnis, **tidak** butuh sudah join company.
- **Request Body:**
  ```json
  {
    "token": "string"   // Token dari query param URL email undangan
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "You have successfully joined \"PT Maju Jaya\".",
    "companyId": "uuid",
    "companyName": "PT Maju Jaya",
    "role": "STAFF"
  }
  ```

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Undangan sudah diterima sebelumnya atau sudah direvoke |
| `400` | Token sudah kedaluwarsa (lebih dari 30 menit) |
| `403` | Token bukan milik akun yang sedang login |
| `404` | Token tidak valid / tidak ditemukan |

**Alur yang direkomendasikan di frontend:**

```
User klik link email
  → ?token=abc123 didapat dari URL query param
  → Cek apakah user sudah login
      ├── Belum login → redirect ke halaman Login
      │     → setelah login, lanjut ke step berikutnya
      └── Sudah login → langsung panggil POST /business/members/accept
            → Sukses → redirect ke dashboard company
            → Gagal  → tampilkan pesan error sesuai kondisi
```

**Catatan frontend:**
- Simpan `token` di `sessionStorage` atau query param saat redirect ke login, agar tidak hilang setelah proses autentikasi.
- Setelah sukses, panggil ulang endpoint `GET /business/company` untuk mendapatkan context company user yang baru bergabung.

---

## 4. Update Role Member

Mengubah role seorang member. **Hanya `OWNER`** yang memiliki akses ke endpoint ini.

- **Endpoint:** `PUT /business/members/:id/role`
- **Path Param:** `:id` — UUID dari `CompanyMember` (bukan `userId`)
- **Role minimum:** `OWNER`
- **Request Body:**
  ```json
  {
    "role": "string"   // Wajib — salah satu: "ADMIN" | "STAFF" | "VIEWER"
  }
  ```
- **Response (200 OK):** Objek `CompanyMember` yang sudah diperbarui, beserta data `user`.
  ```json
  {
    "id": "uuid",
    "companyId": "uuid",
    "userId": "uuid",
    "role": "ADMIN",
    "status": "ACTIVE",
    "invitedAt": "2026-03-19T10:00:00.000Z",
    "joinedAt": "2026-03-19T10:05:00.000Z",
    "user": {
      "email": "budi@example.com",
      "username": "budi"
    }
  }
  ```

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Mencoba mengubah role diri sendiri |
| `400` | Target adalah `OWNER` — role OWNER tidak bisa diubah |
| `400` | Target sudah berstatus `REVOKED` |
| `403` | Pemanggil bukan `OWNER` |
| `404` | Member tidak ditemukan di company ini |

**Catatan frontend:**
- Gunakan `CompanyMember.id` (bukan `user.id`) sebagai path param `:id`.
- Sembunyikan / nonaktifkan opsi ubah role untuk row milik `OWNER` di UI.
- Role `OWNER` tidak tersedia sebagai pilihan dropdown karena ownership tidak bisa dipindah.

---

## 5. Revoke Member (Cabut Akses)

Mencabut akses seorang member dari company. Status berubah menjadi `REVOKED` — member tidak bisa lagi mengakses data company, namun akun Moneytory mereka tidak dihapus.

- **Endpoint:** `DELETE /business/members/:id`
- **Path Param:** `:id` — UUID dari `CompanyMember` (bukan `userId`)
- **Role minimum:** `ADMIN`
- **Response (200 OK):**
  ```json
  {
    "message": "Member budi@example.com has been revoked."
  }
  ```

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Target adalah `OWNER` — tidak bisa direvoke |
| `400` | Mencoba merevoke diri sendiri |
| `400` | Member sudah berstatus `REVOKED` sebelumnya |
| `403` | `ADMIN` mencoba merevoke `ADMIN` lain |
| `403` | Role pemanggil di bawah `ADMIN` |
| `404` | Member tidak ditemukan di company ini |

**Matriks siapa bisa merevoke siapa:**

| Pemanggil ↓ \ Target → | OWNER | ADMIN | STAFF | VIEWER |
|:------------------------|:-----:|:-----:|:-----:|:------:|
| `OWNER` | ❌ | ✅ | ✅ | ✅ |
| `ADMIN` | ❌ | ❌ | ✅ | ✅ |
| `STAFF` | ❌ | ❌ | ❌ | ❌ |
| `VIEWER` | ❌ | ❌ | ❌ | ❌ |

**Catatan frontend:**
- Setelah revoke berhasil, hapus row member tersebut dari list (tidak lagi muncul di `GET /business/members`).
- Member yang sudah direvoke **bisa diundang kembali** — sistem akan me-reset statusnya ke `PENDING`.
- Sembunyikan tombol revoke untuk row milik `OWNER` dan row milik diri sendiri.

---

## Referensi: Tipe Data

### `CompanyMemberRole` (enum)

| Value | Keterangan |
|-------|-----------|
| `OWNER` | Pemilik company. Auto-assign saat company dibuat. |
| `ADMIN` | Akses penuh kecuali hapus company. Bisa invite & revoke STAFF/VIEWER. |
| `STAFF` | Bisa buat invoice & input transaksi. Tidak bisa kelola member. |
| `VIEWER` | Read-only. Hanya bisa melihat data. |

### `CompanyMemberStatus` (enum)

| Value | Keterangan |
|-------|-----------|
| `PENDING` | Undangan terkirim, belum diterima. Menempati slot member. |
| `ACTIVE` | Member aktif, punya akses penuh sesuai role. |
| `REVOKED` | Akses dicabut. Tidak menempati slot member. Bisa diundang ulang. |

### Objek `CompanyMember` (lengkap)

```typescript
{
  id: string;              // UUID CompanyMember — gunakan ini sebagai :id di endpoint
  companyId: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "STAFF" | "VIEWER";
  status: "PENDING" | "ACTIVE" | "REVOKED";
  invitedAt: string;       // ISO 8601 datetime
  joinedAt: string | null; // null jika masih PENDING
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    email: string;
    username: string;
    fullName: string | null;
    profilePicture: string | null;
  };
}
```

---

## Panduan Umum UI/UX

### Halaman Member Management (`/business/members`)

```
┌─────────────────────────────────────────────────┐
│  Members (3/5)                    [+ Invite]     │  ← tombol hanya muncul jika role ≥ ADMIN
├─────────────────────────────────────────────────┤
│  Ahmad Santoso   ahmad@...   👑 OWNER   ACTIVE  │  ← tidak ada tombol edit/revoke
│  Budi Hartono    budi@...    🛡️ ADMIN   ACTIVE  │  ← OWNER: bisa edit role, bisa revoke
│  Cici Rahayu     cici@...    ✏️ STAFF   ACTIVE  │  ← OWNER/ADMIN: bisa edit role, bisa revoke
│  Deni Kurnia     deni@...    👁️ VIEWER  PENDING │  ← badge "Menunggu", tombol revoke ada
└─────────────────────────────────────────────────┘
  Slot terpakai: 4/5
```

### Kondisi Tombol

| Kondisi | Tombol `[+ Invite]` | Tombol `Edit Role` | Tombol `Revoke` |
|---------|:-------------------:|:------------------:|:---------------:|
| Role saya `VIEWER` atau `STAFF` | Sembunyikan | Sembunyikan | Sembunyikan |
| Role saya `ADMIN` | Tampilkan | Sembunyikan | Tampilkan (kecuali untuk OWNER & ADMIN lain) |
| Role saya `OWNER` | Tampilkan | Tampilkan (kecuali untuk diri sendiri) | Tampilkan (kecuali untuk diri sendiri) |
| Slot sudah penuh (5/5) | Nonaktifkan + tooltip | — | — |

### Email Undangan (Skenario B — user terdaftar)

Email yang diterima invitee berisi:
- Nama company yang mengundang
- Role yang akan diberikan
- Tombol **"Accept Invitation"** → mengarah ke:
  ```
  {FRONTEND_URL}/business/invite/accept?token={token}
  ```
- Link teks alternatif jika tombol tidak bisa diklik
- Peringatan bahwa link kedaluwarsa dalam **30 menit**

### Email Ajakan Daftar (Skenario A — user belum terdaftar)

Email yang diterima berisi:
- Nama company yang mengundang & role yang akan diberikan
- Tombol **"Create an Account"** → mengarah ke:
  ```
  {FRONTEND_URL}/register?email={email_invitee}&ref=invite
  ```

**Yang harus dilakukan frontend di halaman `/register`:**
- Baca query param `?email=` → pre-fill field email dengan nilai tersebut
- Set field email menjadi **`readonly`** (tidak bisa diubah user) agar email yang didaftarkan sesuai dengan yang diundang
- Baca query param `?ref=invite` → setelah register berhasil, tampilkan pesan: *"Akun berhasil dibuat! Hubungi admin perusahaan untuk mengirim undangan ke email ini."*

---

*End of Document — Phase 2 Frontend API Docs — v1.0 — 2026-03-19*
