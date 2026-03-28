# Frontend API Documentation — Phase 8: Advanced Accounting Features

> **Base URL:** `{{API_BASE_URL}}/api`
> **Auth:** Semua endpoint memerlukan `Authorization: Bearer <access_token>` di header.
> **Company Context:** Semua endpoint `/business/*` memerlukan header `x-company-id: <companyId>`.

---

## Daftar Isi

1. [Role & Permission Matrix](#1-role--permission-matrix)
2. [Perubahan pada Transaksi (Approval Workflow)](#2-perubahan-pada-transaksi-approval-workflow)
   - [2.0 Buat Jurnal Manual](#20-buat-jurnal-manual)
   - [2.1 List Transaksi](#21-list-transaksi-dengan-filter-status-baru)
   - [2.2 Submit](#22-submit-jurnal-untuk-checking) · [2.3 Check](#23-check-gate-pertama) · [2.4 Approve](#24-approve) · [2.5 Reject](#25-reject)
3. [Attachment pada Jurnal Manual](#3-attachment-pada-jurnal-manual)
4. [Konfigurasi Pajak (Tax Config)](#4-konfigurasi-pajak-tax-config)
5. [Tax Suggestion Engine](#5-tax-suggestion-engine)
6. [Custom Tax Suggestion Rules](#6-custom-tax-suggestion-rules)
7. [Manajemen Aset (Asset Management)](#7-manajemen-aset-asset-management)
8. [Penyusutan Aset (Depreciation)](#8-penyusutan-aset-depreciation)
9. [KPI Dashboard — P&L Detail (Phase 8)](#9-kpi-dashboard--pl-detail-phase-8)
10. [Pengaturan Perusahaan — Approval Workflow Toggle](#10-pengaturan-perusahaan--approval-workflow-toggle)
11. [Enum Reference](#11-enum-reference)
12. [Error Reference](#12-error-reference)
13. [**UPDATE** — Pajak per Invoice (`taxConfigId`)](#13-update--pajak-per-invoice-taxconfigid)

---

## 1. Role & Permission Matrix

Phase 8 menambahkan role baru **CHECKER** di antara STAFF dan ADMIN.

| Role    | Level | Deskripsi                                                     |
|---------|-------|---------------------------------------------------------------|
| VIEWER  | 0     | Hanya baca                                                    |
| STAFF   | 1     | Buat transaksi, submit untuk review, upload lampiran          |
| CHECKER | 2     | Semua STAFF + bisa check (gate pertama) dan reject            |
| ADMIN   | 3     | Semua CHECKER + bisa approve, manage aset, manage pajak       |
| OWNER   | 4     | Akses penuh                                                   |

**Catatan:** Role bekerja secara hierarkis. ADMIN otomatis bisa melakukan semua yang CHECKER bisa, dan seterusnya.

---

## 2. Perubahan pada Transaksi (Approval Workflow)

### Alur Status Jurnal

```
                    ┌─────────────────────────────────────────────────┐
                    │          requiresApprovalWorkflow = false        │
                    │         (langsung APPROVED saat dibuat)          │
                    └─────────────────────────────────────────────────┘

                    ┌─────────────────────────────────────────────────┐
                    │          requiresApprovalWorkflow = true         │
                    │                                                  │
                    │   DRAFT → [submit] → PENDING_CHECK              │
                    │                          ↓                      │
                    │                    [check] → PENDING_APPROVAL   │
                    │                          ↓                      │
                    │                    [approve] → APPROVED         │
                    │                                                  │
                    │   PENDING_CHECK atau PENDING_APPROVAL            │
                    │        → [reject] → REJECTED                    │
                    │                          ↓                      │
                    │                    [submit ulang] → PENDING_CHECK│
                    └─────────────────────────────────────────────────┘
```

### 2.0 Buat Jurnal Manual

**`POST /business/transactions`** — Role: STAFF+ | HTTP 201

> **Content-Type:** `multipart/form-data`

Endpoint ini mendukung upload lampiran sekaligus saat membuat jurnal (opsional, maks 5 file).

**Form Fields:**

| Field    | Tipe   | Wajib | Deskripsi                                                              |
|----------|--------|-------|------------------------------------------------------------------------|
| `data`   | string | Ya    | JSON string berisi data jurnal (lihat struktur di bawah)               |
| `files`  | File[] | Tidak | Lampiran (PDF/JPEG/PNG/WebP, maks 10 MB/file, maks 5 file sekaligus)  |

**Struktur field `data` (JSON string):**
```json
{
  "description": "Pembayaran jasa konsultan IT",
  "transactionDate": "2026-03-15",
  "lines": [
    {
      "coaId": "uuid-coa-beban-usaha",
      "type": "DEBIT",
      "amount": 5000000,
      "description": "Beban jasa konsultan",
      "contactId": "uuid-contact"
    },
    {
      "coaId": "uuid-coa-kas",
      "type": "CREDIT",
      "amount": 5000000,
      "description": null,
      "contactId": null
    }
  ]
}
```

| Field                 | Tipe   | Wajib | Deskripsi                                      |
|-----------------------|--------|-------|------------------------------------------------|
| `description`         | string | Ya    | Deskripsi jurnal                               |
| `transactionDate`     | string | Ya    | Format: `YYYY-MM-DD`                           |
| `lines`               | array  | Ya    | Min 2 baris (minimal 1 DEBIT dan 1 CREDIT)     |
| `lines[].coaId`       | UUID   | Ya    | ID Chart of Account                            |
| `lines[].type`        | enum   | Ya    | `DEBIT` atau `CREDIT`                          |
| `lines[].amount`      | number | Ya    | Nominal, positif, maks 2 desimal               |
| `lines[].description` | string | Tidak | Deskripsi per baris                            |
| `lines[].contactId`   | UUID   | Tidak | ID contact/vendor/karyawan terkait             |

> **Validasi:** Total DEBIT harus sama dengan total CREDIT. Jika tidak, server mengembalikan `400`.

**Contoh dengan fetch (tanpa file):**
```javascript
const formData = new FormData();
formData.append('data', JSON.stringify({
  description: 'Pembayaran jasa konsultan IT',
  transactionDate: '2026-03-15',
  lines: [
    { coaId: 'uuid-debit', type: 'DEBIT', amount: 5000000 },
    { coaId: 'uuid-credit', type: 'CREDIT', amount: 5000000 },
  ],
}));

const response = await fetch(`${API_BASE}/business/transactions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'x-company-id': companyId },
  body: formData,
});
```

**Contoh dengan fetch (dengan file):**
```javascript
const formData = new FormData();
formData.append('data', JSON.stringify({ /* ...sama seperti di atas... */ }));
formData.append('files', fileInput.files[0]);
formData.append('files', fileInput.files[1]); // bisa multiple

const response = await fetch(`${API_BASE}/business/transactions`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'x-company-id': companyId },
  body: formData,
  // JANGAN set Content-Type manual
});
```

**Status awal jurnal:**
- Jika `requiresApprovalWorkflow = false` (default) → langsung `APPROVED`
- Jika `requiresApprovalWorkflow = true` → dibuat sebagai `DRAFT`

**Response:** Objek journal entry lengkap. Jika ada file yang diupload, field `attachments` akan berisi data lampiran.

**Error Cases:**
- `400` — Field `data` bukan JSON valid
- `400` — Jurnal tidak balance (total debit ≠ total kredit)
- `400` — Lines kurang dari 2, atau tidak ada DEBIT/CREDIT
- `400` — Tipe file tidak didukung atau ukuran > 10 MB
- `400` — Jumlah file melebihi 5
- `404` — Salah satu `coaId` atau `contactId` tidak ditemukan di perusahaan ini

---

### 2.1 List Transaksi (dengan filter status baru)

**`GET /business/transactions`** — Role: VIEWER+

**Query Parameters:**

| Parameter   | Tipe    | Wajib | Deskripsi                                                     |
|-------------|---------|-------|---------------------------------------------------------------|
| `startDate` | string  | Tidak | Format: `YYYY-MM-DD`                                          |
| `endDate`   | string  | Tidak | Format: `YYYY-MM-DD`                                          |
| `coaId`     | UUID    | Tidak | Filter by COA                                                 |
| `contactId` | UUID    | Tidak | Filter by contact                                             |
| `status`    | enum    | Tidak | `DRAFT` `PENDING_CHECK` `PENDING_APPROVAL` `APPROVED` `REJECTED` |
| `page`      | number  | Tidak | Default: `1`                                                  |
| `limit`     | number  | Tidak | Default: `20`, max: `100`                                     |

**Response:**
```json
{
  "data": [
    {
      "id": "uuid",
      "companyId": "uuid",
      "description": "Pembayaran jasa konsultan",
      "transactionDate": "2026-03-15T00:00:00.000Z",
      "status": "PENDING_CHECK",
      "isSystemGenerated": false,
      "createdByUserId": "uuid",
      "checkerUserId": null,
      "checkedAt": null,
      "approverUserId": null,
      "approvedAt": null,
      "rejectedAt": null,
      "rejectionNote": null,
      "createdAt": "2026-03-15T10:00:00.000Z",
      "updatedAt": "2026-03-15T10:05:00.000Z",
      "lines": [
        {
          "id": "uuid",
          "type": "DEBIT",
          "amount": "5000000.00",
          "description": "Beban jasa konsultan",
          "coa": { "id": "uuid", "code": "5-001", "name": "Beban Usaha", "type": "EXPENSE" },
          "contact": { "id": "uuid", "name": "PT Konsultan Jaya", "type": "VENDOR" }
        },
        {
          "id": "uuid",
          "type": "CREDIT",
          "amount": "5000000.00",
          "description": null,
          "coa": { "id": "uuid", "code": "1-001", "name": "Kas", "type": "ASSET" },
          "contact": null
        }
      ],
      "invoice": null,
      "attachments": [
        {
          "id": "uuid",
          "fileName": "invoice-konsultan.pdf",
          "mimeType": "application/pdf",
          "fileSize": 204800,
          "createdAt": "2026-03-15T10:02:00.000Z"
        }
      ],
      "checker": null,
      "approver": null
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

> **Field baru Phase 8:** `status`, `checkerUserId`, `checkedAt`, `approverUserId`, `approvedAt`, `rejectedAt`, `rejectionNote`, `checker`, `approver`, `attachments`.

---

### 2.2 Submit Jurnal untuk Checking

**`POST /business/transactions/:id/submit`** — Role: STAFF+ | HTTP 200

Mengubah status dari `DRAFT` atau `REJECTED` → `PENDING_CHECK`.

**Path Params:** `id` (UUID journal entry)

**Request Body:** _(kosong)_

**Response:**
```json
{
  "id": "uuid",
  "status": "PENDING_CHECK",
  "description": "Pembayaran jasa konsultan",
  "transactionDate": "2026-03-15T00:00:00.000Z",
  "...field lainnya"
}
```

**Error Cases:**
- `400` — Entry sudah tidak berstatus DRAFT/REJECTED
- `400` — Entry adalah system-generated (tidak bisa dimodifikasi)
- `404` — Entry tidak ditemukan

---

### 2.3 Check (Gate Pertama)

**`POST /business/transactions/:id/check`** — Role: CHECKER+ | HTTP 200

Mengubah status dari `PENDING_CHECK` → `PENDING_APPROVAL`. Mengisi `checkerUserId` dan `checkedAt`.

**Path Params:** `id` (UUID journal entry)

**Request Body:** _(kosong)_

**Response:**
```json
{
  "id": "uuid",
  "status": "PENDING_APPROVAL",
  "checkerUserId": "uuid",
  "checkedAt": "2026-03-15T11:00:00.000Z",
  "...field lainnya"
}
```

**Error Cases:**
- `403` — Role tidak cukup (butuh CHECKER/ADMIN/OWNER)
- `400` — Entry tidak berstatus PENDING_CHECK

---

### 2.4 Approve

**`POST /business/transactions/:id/approve`** — Role: ADMIN+ | HTTP 200

Mengubah status dari `PENDING_APPROVAL` → `APPROVED`. Mengisi `approverUserId` dan `approvedAt`.

**Path Params:** `id` (UUID journal entry)

**Request Body:** _(kosong)_

**Response:**
```json
{
  "id": "uuid",
  "status": "APPROVED",
  "approverUserId": "uuid",
  "approvedAt": "2026-03-15T12:00:00.000Z",
  "...field lainnya"
}
```

**Error Cases:**
- `403` — Role tidak cukup (butuh ADMIN/OWNER)
- `400` — Entry tidak berstatus PENDING_APPROVAL

---

### 2.5 Reject

**`POST /business/transactions/:id/reject`** — Role: CHECKER+ | HTTP 200

Menolak entry yang berstatus `PENDING_CHECK` atau `PENDING_APPROVAL` → `REJECTED`.

**Path Params:** `id` (UUID journal entry)

**Request Body:**
```json
{
  "note": "Bukti transaksi tidak lengkap, harap lampirkan invoice asli."
}
```

| Field  | Tipe   | Wajib | Deskripsi                        |
|--------|--------|-------|----------------------------------|
| `note` | string | Tidak | Alasan penolakan (max 1000 char) |

**Response:**
```json
{
  "id": "uuid",
  "status": "REJECTED",
  "rejectedAt": "2026-03-15T11:30:00.000Z",
  "rejectionNote": "Bukti transaksi tidak lengkap, harap lampirkan invoice asli.",
  "...field lainnya"
}
```

**Error Cases:**
- `403` — Role tidak cukup (butuh CHECKER/ADMIN/OWNER)
- `400` — Entry tidak berstatus PENDING_CHECK atau PENDING_APPROVAL

---

## 3. Attachment pada Jurnal Manual

Setiap jurnal manual dapat memiliki **maksimal 5 lampiran**. Format yang didukung: PDF, JPEG, PNG, WebP. Ukuran maksimal per file: **10 MB**.

### 3.1 List Attachment

**`GET /business/transactions/:id/attachments`** — Role: VIEWER+

**Response:**
```json
[
  {
    "id": "uuid",
    "journalEntryId": "uuid",
    "companyId": "uuid",
    "fileName": "invoice-maret.pdf",
    "fileUrl": "journal-attachments/companyId/entryId/...",
    "fileSize": 204800,
    "mimeType": "application/pdf",
    "createdAt": "2026-03-15T10:02:00.000Z",
    "presignedUrl": "https://storage.example.com/...?token=...",
    "uploadedBy": {
      "id": "uuid",
      "fullName": "Budi Santoso",
      "email": "budi@example.com"
    }
  }
]
```

> **`presignedUrl`** adalah URL sementara untuk mengakses file langsung. Gunakan URL ini untuk preview/download. Bisa null jika storage error.

---

### 3.2 Upload Attachment

**`POST /business/transactions/:id/attachments`** — Role: STAFF+ | HTTP 201

> **Content-Type:** `multipart/form-data`

**Form Fields:**

| Field  | Tipe | Wajib | Deskripsi                                    |
|--------|------|-------|----------------------------------------------|
| `file` | File | Ya    | File lampiran (PDF/JPEG/PNG/WebP, maks 10MB) |

**Contoh dengan fetch:**
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch(`${API_BASE}/business/transactions/${entryId}/attachments`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-company-id': companyId,
  },
  body: formData,
  // JANGAN set Content-Type manual — biarkan browser yang mengisi boundary
});
```

**Response:**
```json
{
  "id": "uuid",
  "journalEntryId": "uuid",
  "companyId": "uuid",
  "fileName": "invoice-maret.pdf",
  "fileUrl": "journal-attachments/.../filename.pdf",
  "fileSize": 204800,
  "mimeType": "application/pdf",
  "uploadedByUserId": "uuid",
  "createdAt": "2026-03-15T10:02:00.000Z"
}
```

**Error Cases:**
- `400` — Tipe file tidak didukung
- `400` — Ukuran file melebihi 10 MB
- `400` — Sudah mencapai batas 5 lampiran
- `403` — Entry berstatus `PENDING_CHECK` atau `PENDING_APPROVAL` (sedang direview — tidak bisa ditambah lampiran)
- `403` — Entry berstatus `APPROVED` dan user bukan ADMIN/OWNER

> **Catatan status yang diizinkan untuk upload:**
> | Status             | STAFF | CHECKER | ADMIN/OWNER |
> |--------------------|-------|---------|-------------|
> | `DRAFT`            | ✓     | ✓       | ✓           |
> | `PENDING_CHECK`    | ✗     | ✗       | ✗           |
> | `PENDING_APPROVAL` | ✗     | ✗       | ✗           |
> | `APPROVED`         | ✗     | ✗       | ✓           |
> | `REJECTED`         | ✓     | ✓       | ✓           |
>
> Jika entry sudah di-submit untuk review dan perlu ditambah lampiran, entry harus di-reject terlebih dahulu oleh CHECKER.

---

### 3.3 Hapus Attachment

**`DELETE /business/transactions/:id/attachments/:attachmentId`** — Role: STAFF+ | HTTP 200

Hanya uploader atau ADMIN/OWNER yang bisa menghapus.

**Response:**
```json
{ "message": "Attachment deleted." }
```

**Error Cases:**
- `403` — Bukan uploader dan bukan ADMIN/OWNER
- `404` — Attachment tidak ditemukan

---

## 4. Konfigurasi Pajak (Tax Config)

Sebelum fitur Tax Suggestion bisa digunakan, perusahaan harus mengkonfigurasi jenis-jenis pajak PPh yang relevan terlebih dahulu.

### 4.1 List Tax Config

**`GET /business/tax`** — Role: VIEWER+

**Response:**
```json
[
  {
    "id": "uuid",
    "companyId": "uuid",
    "type": "PPH_23",
    "name": "PPh Pasal 23 - Jasa",
    "rate": "2.0000",
    "isActive": true,
    "description": "Pemotongan PPh 23 untuk pembayaran jasa kepada badan",
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z"
  }
]
```

---

### 4.2 Buat Tax Config

**`POST /business/tax`** — Role: ADMIN+ | HTTP 201

**Request Body:**
```json
{
  "type": "PPH_23",
  "name": "PPh Pasal 23 - Jasa",
  "rate": 2,
  "isActive": true,
  "description": "Pemotongan PPh 23 untuk pembayaran jasa kepada badan"
}
```

| Field         | Tipe    | Wajib | Deskripsi                                            |
|---------------|---------|-------|------------------------------------------------------|
| `type`        | enum    | Ya    | Lihat [TaxType enum](#taxtype)                       |
| `name`        | string  | Ya    | Nama deskriptif, maks 100 karakter                   |
| `rate`        | number  | Ya    | Tarif dalam persen (0–100), maks 4 desimal           |
| `isActive`    | boolean | Tidak | Default: `true`                                      |
| `description` | string  | Tidak | Keterangan tambahan, maks 500 karakter               |

> **Contoh rate:** PPh 23 jasa = `2`, PPh 23 dividen = `15`, PPh 21 = sesuai bracket (misal `5`).

**Response:** Objek TaxConfig yang dibuat.

---

### 4.3 Update Tax Config

**`PUT /business/tax/:id`** — Role: ADMIN+ | HTTP 200

**Request Body:** Semua field opsional (partial update):
```json
{
  "rate": 2.5,
  "isActive": false
}
```

---

### 4.4 Hapus Tax Config

**`DELETE /business/tax/:id`** — Role: ADMIN+ | HTTP 200

**Response:**
```json
{ "message": "Tax config deleted." }
```

> **Perhatian:** Menghapus TaxConfig yang digunakan oleh custom suggestion rules akan otomatis menghapus rules tersebut (cascade delete).

---

## 5. Tax Suggestion Engine

Engine ini menyarankan jenis PPh yang mungkin berlaku berdasarkan konteks transaksi (COA, contact, kata kunci).

**`POST /business/tax/suggest`** — Role: STAFF+ | HTTP 200

**Kapan digunakan:** Panggil endpoint ini saat user sedang mengisi form jurnal manual, setelah user memilih COA, contact, atau mengetik deskripsi.

**Request Body:** (semua field opsional)
```json
{
  "debitCoaId": "uuid-coa-beban-usaha",
  "creditCoaId": "uuid-coa-kas",
  "contactId": "uuid-contact",
  "amount": 5000000,
  "description": "Pembayaran jasa konsultan IT"
}
```

| Field         | Tipe   | Wajib | Deskripsi                                        |
|---------------|--------|-------|--------------------------------------------------|
| `debitCoaId`  | UUID   | Tidak | COA yang di-debit dalam transaksi                |
| `creditCoaId` | UUID   | Tidak | COA yang di-kredit dalam transaksi               |
| `contactId`   | UUID   | Tidak | Contact/vendor/karyawan terkait                  |
| `amount`      | number | Tidak | Jumlah transaksi (untuk kalkulasi tax amount)    |
| `description` | string | Tidak | Deskripsi transaksi (dianalisis untuk keyword)   |

**Response:**
```json
{
  "suggestions": [
    {
      "taxConfigId": "uuid",
      "type": "PPH_23",
      "name": "PPh Pasal 23 - Jasa",
      "rate": "2.0000",
      "taxAmount": "100000.00",
      "netAmount": "4900000.00",
      "confidence": "HIGH",
      "reason": "Pembayaran jasa/sewa/royalti ke badan usaha — dikenakan PPh Pasal 23 (2% jasa, 15% dividen/bunga/royalti).",
      "source": "SYSTEM_RULE"
    },
    {
      "taxConfigId": "uuid",
      "type": "PPH_21",
      "name": "PPh Pasal 21",
      "rate": "5.0000",
      "taxAmount": "250000.00",
      "netAmount": "4750000.00",
      "confidence": "MEDIUM",
      "reason": "Terdeteksi kemungkinan pembayaran ke individu (keyword cocok). Konfirmasi apakah penerima adalah orang pribadi.",
      "source": "SYSTEM_RULE"
    }
  ],
  "notes": null
}
```

**Field Response:**

| Field                        | Deskripsi                                                         |
|------------------------------|-------------------------------------------------------------------|
| `suggestions`                | Array saran pajak, diurutkan HIGH → MEDIUM → LOW                 |
| `suggestions[].taxConfigId`  | ID TaxConfig yang dikonfigurasi perusahaan                        |
| `suggestions[].type`         | Jenis pajak                                                       |
| `suggestions[].rate`         | Tarif dalam persen (string, 4 desimal)                            |
| `suggestions[].taxAmount`    | Estimasi jumlah pajak = `amount × rate/100`                       |
| `suggestions[].netAmount`    | Estimasi jumlah setelah potong pajak = `amount - taxAmount`       |
| `suggestions[].confidence`   | `HIGH` / `MEDIUM` / `LOW`                                        |
| `suggestions[].reason`       | Penjelasan mengapa pajak ini disarankan                           |
| `suggestions[].source`       | `SYSTEM_RULE` (bawaan sistem) atau `CUSTOM_RULE` (dibuat company) |
| `notes`                      | Pesan jika tidak ada saran, atau null                             |

**Confidence Logic:**

| Confidence | Kondisi                                                    |
|------------|------------------------------------------------------------|
| `HIGH`     | ≥2 sinyal cocok (contact type + COA + keyword)             |
| `MEDIUM`   | 1 sinyal cocok                                             |
| `LOW`      | Cocok tapi sinyal lemah                                    |

> **UX Recommendation:** Tampilkan saran dengan badge warna (HIGH = hijau, MEDIUM = kuning, LOW = abu-abu). Beri tombol "Terapkan" yang mengisi field pajak secara otomatis di form transaksi.

> **Catatan:** Suggestion TIDAK otomatis membuat line jurnal untuk pajak. User tetap harus menambah line PPh secara manual ke jurnal. Suggestion hanya sebagai panduan.

---

## 6. Custom Tax Suggestion Rules

Admin bisa membuat aturan suggestion kustom di luar aturan sistem bawaan.

### 6.1 List Rules

**`GET /business/tax/suggestion-rules`** — Role: VIEWER+

**Response:**
```json
[
  {
    "id": "uuid",
    "companyId": "uuid",
    "taxConfigId": "uuid",
    "triggerCoaIds": ["uuid-coa-1"],
    "triggerContactType": "VENDOR",
    "triggerKeywords": ["pemeliharaan", "maintenance"],
    "minAmount": "1000000.00",
    "priority": 10,
    "note": "Jasa pemeliharaan gedung ke vendor — PPh 23",
    "isActive": true,
    "createdAt": "2026-03-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "taxConfig": {
      "id": "uuid",
      "name": "PPh Pasal 23 - Jasa",
      "type": "PPH_23",
      "rate": "2.0000"
    }
  }
]
```

---

### 6.2 Buat Custom Rule

**`POST /business/tax/suggestion-rules`** — Role: ADMIN+ | HTTP 201

**Request Body:**
```json
{
  "taxConfigId": "uuid",
  "triggerCoaIds": ["uuid-coa-1", "uuid-coa-2"],
  "triggerContactType": "VENDOR",
  "triggerKeywords": ["pemeliharaan", "maintenance", "perbaikan"],
  "minAmount": 1000000,
  "priority": 10,
  "note": "Jasa pemeliharaan gedung ke vendor — PPh 23",
  "isActive": true
}
```

| Field                | Tipe          | Wajib | Deskripsi                                                       |
|----------------------|---------------|-------|-----------------------------------------------------------------|
| `taxConfigId`        | UUID          | Ya    | ID TaxConfig yang sudah dibuat perusahaan                       |
| `triggerCoaIds`      | UUID[]        | Tidak | Jika salah satu COA ini dipakai dalam transaksi, rule aktif     |
| `triggerContactType` | enum          | Tidak | `CUSTOMER` `VENDOR` `EMPLOYEE` `OTHER`                          |
| `triggerKeywords`    | string[]      | Tidak | Kata kunci di deskripsi transaksi (case-insensitive)            |
| `minAmount`          | number        | Tidak | Rule hanya aktif jika amount >= nilai ini                       |
| `priority`           | number        | Tidak | Angka lebih tinggi = lebih diprioritaskan. Default: `0`         |
| `note`               | string        | Tidak | Muncul sebagai `reason` di suggestion. Maks 500 karakter        |
| `isActive`           | boolean       | Tidak | Default: `true`                                                 |

---

### 6.3 Update Custom Rule

**`PUT /business/tax/suggestion-rules/:id`** — Role: ADMIN+ | HTTP 200

Request body sama dengan create, semua opsional.

---

### 6.4 Hapus Custom Rule

**`DELETE /business/tax/suggestion-rules/:id`** — Role: ADMIN+ | HTTP 200

**Response:**
```json
{ "message": "Suggestion rule deleted." }
```

---

## 7. Manajemen Aset (Asset Management)

Mendukung PSAK 16 (Aset Tetap/Tangible) dan PSAK 19 (Aset Tak Berwujud/Intangible).

### 7.1 List Aset

**`GET /business/assets`** — Role: VIEWER+

**Query Parameters:**

| Parameter | Tipe | Wajib | Deskripsi                                      |
|-----------|------|-------|------------------------------------------------|
| `status`  | enum | Tidak | `ACTIVE` `FULLY_DEPRECIATED` `DISPOSED`        |

**Response:**
```json
[
  {
    "id": "uuid",
    "companyId": "uuid",
    "assetType": "TANGIBLE",
    "name": "Laptop Dell XPS 15",
    "code": "IT-001",
    "acquisitionDate": "2025-01-01T00:00:00.000Z",
    "acquisitionCost": "25000000",
    "residualValue": "2500000",
    "usefulLifeMonths": 48,
    "depreciationMethod": "STRAIGHT_LINE",
    "unitsTotal": null,
    "status": "ACTIVE",
    "disposalDate": null,
    "disposalAmount": null,
    "disposalCoaId": null,
    "notes": "Untuk kebutuhan tim engineering",
    "createdByUserId": "uuid",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2026-03-01T00:00:00.000Z",
    "assetCoa": { "id": "uuid", "code": "1-004", "name": "Aset Tetap" },
    "accumulatedCoa": { "id": "uuid", "code": "1-005", "name": "Akumulasi Penyusutan" },
    "depreciationExpenseCoa": { "id": "uuid", "code": "5-004", "name": "Beban Penyusutan" },
    "depreciationCount": 14,
    "totalDepreciated": "6416666.67",
    "currentBookValue": "18583333.33"
  }
]
```

**Field Kalkulasi (dihitung server):**

| Field                | Deskripsi                                                   |
|----------------------|-------------------------------------------------------------|
| `depreciationCount`  | Jumlah periode penyusutan yang sudah dijalankan             |
| `totalDepreciated`   | Total akumulasi penyusutan s.d. sekarang                    |
| `currentBookValue`   | Nilai buku saat ini = `acquisitionCost - totalDepreciated` (min `residualValue`) |

---

### 7.2 Detail Aset

**`GET /business/assets/:id`** — Role: VIEWER+

Response sama dengan list, ditambah:
- `disposalCoa` — COA pelepasan (jika sudah disposed)
- `depreciations` — 5 periode terbaru

```json
{
  "...field dari list...",
  "disposalCoa": null,
  "depreciations": [
    {
      "id": "uuid",
      "periodYear": 2026,
      "periodMonth": 3,
      "depreciationAmount": "458333.33",
      "accumulatedDepreciation": "6416666.67",
      "bookValue": "18583333.33"
    }
  ]
}
```

---

### 7.3 Buat Aset

**`POST /business/assets`** — Role: ADMIN+ | HTTP 201

**Request Body:**
```json
{
  "assetType": "TANGIBLE",
  "name": "Laptop Dell XPS 15",
  "code": "IT-001",
  "acquisitionDate": "2025-01-01",
  "acquisitionCost": 25000000,
  "residualValue": 2500000,
  "usefulLifeMonths": 48,
  "depreciationMethod": "STRAIGHT_LINE",
  "unitsTotal": null,
  "assetCoaId": "uuid-coa-aset-tetap",
  "accumulatedCoaId": "uuid-coa-akumulasi",
  "depreciationExpenseCoaId": "uuid-coa-beban-penyusutan",
  "notes": "Untuk kebutuhan tim engineering"
}
```

| Field                      | Tipe    | Wajib               | Deskripsi                                                    |
|----------------------------|---------|---------------------|--------------------------------------------------------------|
| `assetType`                | enum    | Ya                  | `TANGIBLE` (PSAK 16) atau `INTANGIBLE` (PSAK 19)            |
| `name`                     | string  | Ya                  | Nama aset, maks 150 karakter                                 |
| `code`                     | string  | Ya                  | Kode unik aset dalam perusahaan, maks 30 karakter            |
| `acquisitionDate`          | string  | Ya                  | Format: `YYYY-MM-DD`                                         |
| `acquisitionCost`          | number  | Ya                  | Harga perolehan, min 0.01                                    |
| `residualValue`            | number  | Tidak               | Nilai sisa/residu. Default: `0`                              |
| `usefulLifeMonths`         | integer | Ya                  | Masa manfaat dalam bulan (1–600)                             |
| `depreciationMethod`       | enum    | Ya                  | Lihat [DepreciationMethod enum](#depreciationmethod)          |
| `unitsTotal`               | number  | Ya jika UoP        | Total unit produksi selama masa manfaat (wajib jika `UNITS_OF_PRODUCTION`) |
| `assetCoaId`               | UUID    | Ya                  | COA untuk nilai perolehan aset (biasanya kode `1-004`)       |
| `accumulatedCoaId`         | UUID    | Ya                  | COA akumulasi penyusutan (biasanya kode `1-005`)             |
| `depreciationExpenseCoaId` | UUID    | Ya                  | COA beban penyusutan (biasanya kode `5-004`)                 |
| `notes`                    | string  | Tidak               | Catatan tambahan, maks 1000 karakter                         |

> **COA Default yang tersedia (Phase 8):**
> - `1-004` — Aset Tetap (assetCoaId)
> - `1-005` — Akumulasi Penyusutan Aset Tetap (accumulatedCoaId)
> - `1-006` — Aset Tak Berwujud
> - `1-007` — Akumulasi Amortisasi Aset Tak Berwujud
> - `5-004` — Beban Penyusutan & Amortisasi (depreciationExpenseCoaId)

**Error Cases:**
- `400` — `code` sudah digunakan di perusahaan ini
- `400` — `UNITS_OF_PRODUCTION` dipilih tapi `unitsTotal` tidak diisi
- `404` — Salah satu COA tidak ditemukan di perusahaan ini

---

### 7.4 Update Aset

**`PUT /business/assets/:id`** — Role: ADMIN+ | HTTP 200

Hanya `name` dan `notes` yang bisa diupdate (field finansial bersifat immutable setelah dibuat).

**Request Body:**
```json
{
  "name": "Laptop Dell XPS 15 (Updated)",
  "notes": "Telah diupgrade RAM 32GB"
}
```

---

### 7.5 Hapus Aset

**`DELETE /business/assets/:id`** — Role: ADMIN+ | HTTP 200

**Error Cases:**
- `400` — Aset sudah memiliki record penyusutan (tidak bisa dihapus)

**Response:**
```json
{ "message": "Asset deleted." }
```

---

### 7.6 Pelepasan Aset (Disposal)

**`POST /business/assets/:id/dispose`** — Role: ADMIN+ | HTTP 201

Mencatat pelepasan aset dan membuat jurnal double-entry secara otomatis.

**Jurnal yang dibuat otomatis (PSAK 16):**
```
DR  Kas/Bank (disposalCoaId)       = disposalAmount
DR  Akumulasi Penyusutan           = totalAccumulated
CR  Aset Tetap                     = acquisitionCost
DR/CR  Laba/Rugi Pelepasan         = |gain|
```

**Request Body:**
```json
{
  "disposalDate": "2026-03-15",
  "disposalAmount": 15000000,
  "disposalCoaId": "uuid-coa-kas",
  "gainCoaId": null,
  "lossCoaId": null
}
```

| Field          | Tipe   | Wajib | Deskripsi                                                               |
|----------------|--------|-------|-------------------------------------------------------------------------|
| `disposalDate` | string | Ya    | Tanggal pelepasan, format `YYYY-MM-DD`                                  |
| `disposalAmount` | number | Ya  | Nilai penerimaan dari pelepasan aset (bisa 0 jika dibuang/scrapped)    |
| `disposalCoaId` | UUID  | Ya    | COA untuk mencatat penerimaan (biasanya Kas/Bank)                       |
| `gainCoaId`    | UUID   | Tidak | Override COA laba pelepasan. Default: COA kode `6-002`                  |
| `lossCoaId`    | UUID   | Tidak | Override COA rugi pelepasan. Default: COA kode `7-002`                  |

**Response:**
```json
{
  "asset": {
    "id": "uuid",
    "status": "DISPOSED",
    "disposalDate": "2026-03-15T00:00:00.000Z",
    "disposalAmount": "15000000",
    "...field lainnya"
  },
  "journalEntry": {
    "id": "uuid",
    "description": "Pelepasan aset: Laptop Dell XPS 15 (IT-001)",
    "status": "APPROVED"
  },
  "bookValue": "18583333.33",
  "gain": "-3583333.33"
}
```

> `gain` negatif = rugi pelepasan. `gain` positif = laba pelepasan.

---

## 8. Penyusutan Aset (Depreciation)

### 8.1 Lihat Proyeksi Jadwal Penyusutan

**`GET /business/assets/:id/schedule`** — Role: VIEWER+

Menampilkan jadwal penyusutan yang tersisa (mulai dari periode berikutnya).

**Response:**
```json
{
  "asset": {
    "id": "uuid",
    "code": "IT-001",
    "name": "Laptop Dell XPS 15",
    "depreciationMethod": "STRAIGHT_LINE",
    "acquisitionCost": "25000000.00",
    "residualValue": "2500000.00",
    "usefulLifeMonths": 48,
    "currentBookValue": "18583333.33",
    "totalDepreciated": "6416666.67",
    "periodsAlreadyRun": 14
  },
  "projectedSchedule": [
    {
      "periodYear": 2026,
      "periodMonth": 4,
      "depreciationAmount": "458333.33",
      "accumulatedDepreciation": "6875000.00",
      "bookValue": "18125000.00"
    },
    {
      "periodYear": 2026,
      "periodMonth": 5,
      "depreciationAmount": "458333.33",
      "accumulatedDepreciation": "7333333.33",
      "bookValue": "17666666.67"
    }
  ]
}
```

---

### 8.2 Riwayat Penyusutan

**`GET /business/assets/:id/depreciations`** — Role: VIEWER+

**Response:**
```json
[
  {
    "id": "uuid",
    "assetId": "uuid",
    "companyId": "uuid",
    "periodYear": 2026,
    "periodMonth": 3,
    "depreciationAmount": "458333.33",
    "accumulatedDepreciation": "6416666.67",
    "bookValue": "18583333.33",
    "unitsProduced": null,
    "journalEntryId": "uuid",
    "createdAt": "2026-03-01T01:00:00.000Z",
    "journalEntry": {
      "id": "uuid",
      "description": "Penyusutan aset: Laptop Dell XPS 15 (IT-001) — Periode 03/2026",
      "transactionDate": "2026-03-01T00:00:00.000Z"
    }
  }
]
```

---

### 8.3 Jalankan Penyusutan Manual (Batch)

**`POST /business/assets/run-depreciation`** — Role: ADMIN+ | HTTP 201

Menjalankan penyusutan untuk satu periode tertentu. Untuk semua aset atau subset aset.

> **Penting:** Endpoint ini TIDAK berlaku untuk aset dengan metode `UNITS_OF_PRODUCTION`. Gunakan endpoint [8.4](#84-catat-unit-produksi--jalankan-penyusutan-uop) untuk aset UoP.

> **Cron otomatis:** Sistem secara otomatis menjalankan penyusutan pada tanggal 1 setiap bulan pukul 01:00 WIB. Endpoint ini untuk run manual jika diperlukan.

**Request Body:**
```json
{
  "year": 2026,
  "month": 3,
  "assetIds": ["uuid-asset-1", "uuid-asset-2"]
}
```

| Field      | Tipe     | Wajib | Deskripsi                                                            |
|------------|----------|-------|----------------------------------------------------------------------|
| `year`     | integer  | Ya    | Tahun periode (2000–2100)                                            |
| `month`    | integer  | Ya    | Bulan periode (1–12)                                                 |
| `assetIds` | UUID[]   | Tidak | Jika diisi, hanya aset tersebut yang diproses. Jika kosong, semua aset ACTIVE di perusahaan. |

**Response:**
```json
{
  "period": { "year": 2026, "month": 3 },
  "total": 5,
  "processed": 4,
  "skipped": 1,
  "results": [
    {
      "assetId": "uuid",
      "assetCode": "IT-001",
      "assetName": "Laptop Dell XPS 15",
      "period": { "year": 2026, "month": 3 },
      "depreciationAmount": "458333.33",
      "accumulatedDepreciation": "6416666.67",
      "bookValue": "18583333.33",
      "isFullyDepreciated": false,
      "journalEntryId": "uuid"
    }
  ]
}
```

> `skipped` = aset yang sudah dijalankan untuk periode ini, atau sudah fully deprecated.

---

### 8.4 Catat Unit Produksi & Jalankan Penyusutan (UoP)

**`POST /business/assets/:id/units`** — Role: STAFF+ | HTTP 201

Khusus untuk aset dengan metode `UNITS_OF_PRODUCTION`. Catat unit yang diproduksi, sistem otomatis menghitung dan menjalankan penyusutan.

**Request Body:**
```json
{
  "year": 2026,
  "month": 3,
  "unitsProduced": 1250.5
}
```

| Field          | Tipe    | Wajib | Deskripsi                                     |
|----------------|---------|-------|-----------------------------------------------|
| `year`         | integer | Ya    | Tahun periode                                 |
| `month`        | integer | Ya    | Bulan periode                                 |
| `unitsProduced` | number | Ya    | Jumlah unit diproduksi bulan ini (min 0.0001) |

**Response:** Sama dengan satu item di `results` dari run-depreciation, atau:
```json
{ "message": "No depreciation applicable for this period (already run or fully depreciated)." }
```

---

## 9. KPI Dashboard — P&L Detail (Phase 8)

### `GET /business/kpi`

Response **sebelumnya** tidak berubah. Phase 8 menambahkan field `profitLossDetail`.

**Response (lengkap):**
```json
{
  "profitability": {
    "period": { "month": 3, "year": 2026 },
    "totalRevenue": "50000000.00",
    "totalExpense": "35000000.00",
    "netProfit": "15000000.00",
    "isProfit": true,
    "profitMargin": "30.00",
    "revenueGrowth": "12.50"
  },
  "profitLossDetail": {
    "period": { "month": 3, "year": 2026 },
    "operatingRevenue": "45000000.00",
    "costOfGoodsSold": "20000000.00",
    "grossProfit": "25000000.00",
    "isGrossProfit": true,
    "operatingExpenses": "12000000.00",
    "nonOperatingIncome": "5000000.00",
    "nonOperatingExpenses": "3000000.00",
    "netProfit": "15000000.00",
    "isNetProfit": true,
    "note": null
  },
  "liquidity": {
    "cashPosition": "80000000.00",
    "totalReceivable": "25000000.00",
    "totalPayable": "10000000.00"
  },
  "invoiceActivity": {
    "totalSentThisMonth": 8,
    "totalPaidThisMonth": 5,
    "totalOverdue": 2,
    "overdueAmount": "15000000.00",
    "outstandingAmount": "25000000.00"
  },
  "breakdown": {
    "topRevenueAccounts": [
      { "coaCode": "4-001", "coaName": "Pendapatan Usaha", "amount": "45000000.00" }
    ],
    "topExpenseAccounts": [
      { "coaCode": "5-001", "coaName": "Beban Usaha", "amount": "12000000.00" }
    ]
  }
}
```

**Formula P&L Detail:**

```
Laba Kotor (grossProfit)     = operatingRevenue - costOfGoodsSold
Laba Bersih (netProfit)      = grossProfit - operatingExpenses + nonOperatingIncome - nonOperatingExpenses
```

**Field `note`:**
- `null` — Data P&L detail tersedia
- `"Set subType on COA accounts to enable P&L detail breakdown."` — Semua COA belum punya `subType`. Ini terjadi jika perusahaan menggunakan COA kustom tanpa subType. COA sistem bawaan sudah otomatis punya subType.

**Mapping subType COA ke P&L Detail:**

| subType        | Masuk ke field          |
|----------------|-------------------------|
| `OPERATING` (Revenue)  | `operatingRevenue`      |
| `NON_OPERATING` (Revenue) | `nonOperatingIncome` |
| `COGS` (Expense) | `costOfGoodsSold`       |
| `OPERATING` (Expense)  | `operatingExpenses`     |
| `NON_OPERATING` (Expense) | `nonOperatingExpenses` |

---

## 10. Pengaturan Perusahaan — Approval Workflow Toggle

### `PUT /business/company`

Field baru Phase 8: `requiresApprovalWorkflow`.

**Request Body (partial):**
```json
{
  "requiresApprovalWorkflow": true
}
```

| Field                      | Tipe    | Wajib | Deskripsi                                                    |
|----------------------------|---------|-------|--------------------------------------------------------------|
| `requiresApprovalWorkflow` | boolean | Tidak | `true` = jurnal baru dibuat sebagai DRAFT (perlu approval workflow). `false` = jurnal langsung APPROVED. Default: `false`. |

> **Perhatian:** Mengaktifkan ini TIDAK mempengaruhi jurnal yang sudah ada. Hanya berlaku untuk jurnal yang dibuat setelah setting diubah.

> **UX Recommendation:** Tampilkan toggle di halaman Settings perusahaan dengan penjelasan alur approval.

---

## 11. Enum Reference

### TaxType
| Value      | Keterangan                                    |
|------------|-----------------------------------------------|
| `PPN`      | Pajak Pertambahan Nilai                        |
| `PPH_21`   | PPh Pasal 21 (penghasilan orang pribadi)       |
| `PPH_22`   | PPh Pasal 22 (impor/pengadaan)                 |
| `PPH_23`   | PPh Pasal 23 (jasa/sewa/royalti ke badan)      |
| `PPH_4_2`  | PPh Pasal 4 Ayat 2 (final: sewa tanah/bangunan/konstruksi) |
| `PPH_15`   | PPh Pasal 15 (pelayaran/penerbangan)           |

### AssetType
| Value        | Keterangan               |
|--------------|--------------------------|
| `TANGIBLE`   | Aset Tetap (PSAK 16)     |
| `INTANGIBLE` | Aset Tak Berwujud (PSAK 19) |

### DepreciationMethod
| Value                  | Keterangan                                        |
|------------------------|---------------------------------------------------|
| `STRAIGHT_LINE`        | Garis lurus — penyusutan tetap per periode        |
| `DECLINING_BALANCE`    | Saldo menurun — tarif × nilai buku saat ini       |
| `DOUBLE_DECLINING`     | Saldo menurun ganda — 2× tarif garis lurus        |
| `UNITS_OF_PRODUCTION`  | Unit produksi — proporsional dengan output        |

### AssetStatus
| Value               | Keterangan                              |
|---------------------|-----------------------------------------|
| `ACTIVE`            | Aset aktif, masih berjalan              |
| `FULLY_DEPRECIATED` | Nilai buku = residual value             |
| `DISPOSED`          | Sudah dilepas/dijual                    |

### JournalEntryStatus
| Value              | Keterangan                              |
|--------------------|-----------------------------------------|
| `DRAFT`            | Dibuat, belum disubmit                  |
| `PENDING_CHECK`    | Menunggu pengecekan (CHECKER)           |
| `PENDING_APPROVAL` | Menunggu persetujuan (ADMIN/OWNER)      |
| `APPROVED`         | Sudah disetujui, efektif dalam laporan  |
| `REJECTED`         | Ditolak, bisa disubmit ulang            |

### ContactType
| Value      | Keterangan      |
|------------|-----------------|
| `CUSTOMER` | Pelanggan        |
| `VENDOR`   | Pemasok/Vendor   |
| `EMPLOYEE` | Karyawan         |
| `OTHER`    | Lainnya          |

### CompanyMemberRole
| Value     | Level |
|-----------|-------|
| `VIEWER`  | 0     |
| `STAFF`   | 1     |
| `CHECKER` | 2     |
| `ADMIN`   | 3     |
| `OWNER`   | 4     |

---

## 12. Error Reference

| HTTP Status | Kondisi Umum                                                  |
|-------------|---------------------------------------------------------------|
| `400`       | Validasi gagal, status tidak valid untuk operasi              |
| `401`       | Token tidak valid atau kadaluarsa                             |
| `403`       | Role tidak cukup, atau operasi tidak diizinkan                |
| `404`       | Resource tidak ditemukan                                      |
| `409`       | Konflik (duplikat kode aset, dsb.)                            |

**Format error:**
```json
{
  "statusCode": 400,
  "message": "Journal entry is not balanced. Debit: 5000000 ≠ Credit: 4500000.",
  "error": "Bad Request"
}
```

**Format validasi (multiple errors):**
```json
{
  "statusCode": 400,
  "message": [
    "rate must not be greater than 100",
    "type must be one of the following values: PPN, PPH_21, PPH_22, PPH_23, PPH_4_2, PPH_15"
  ],
  "error": "Bad Request"
}
```

---

## Catatan Implementasi untuk Frontend

### Urutan Setup Phase 8 untuk Perusahaan Baru

1. **Buat TaxConfig** — Tambahkan jenis-jenis PPh yang relevan (misal PPh 21, PPh 23)
2. **Aktifkan Approval Workflow** (opsional) — Update company `requiresApprovalWorkflow: true`
3. **Tambah COA untuk Aset** — Gunakan COA bawaan (1-004, 1-005, 5-004) atau buat kustom
4. **Daftarkan Aset** — Isi semua field required
5. **Jalankan Penyusutan** — Bisa manual atau tunggu cron otomatis (tanggal 1 tiap bulan)

### Tips UX

- **Form Jurnal Manual:** Panggil `POST /business/tax/suggest` secara debounced (500ms) setiap kali user mengubah COA, contact, atau deskripsi. Tampilkan badge saran di samping form.
- **Status Badge Jurnal:** Gunakan warna berbeda untuk setiap status — DRAFT (abu), PENDING_CHECK (kuning), PENDING_APPROVAL (biru), APPROVED (hijau), REJECTED (merah).
- **Approval Action Buttons:** Tampilkan tombol aksi sesuai status dan role user yang login:
  - Status DRAFT + role STAFF → tampilkan "Submit"
  - Status PENDING_CHECK + role CHECKER+ → tampilkan "Check" dan "Reject"
  - Status PENDING_APPROVAL + role ADMIN+ → tampilkan "Approve" dan "Reject"
- **File Upload:** Validasi tipe dan ukuran file di sisi client sebelum upload (PDF/JPEG/PNG/WebP, max 10MB).
- **P&L Detail Chart:** Sajikan `profitLossDetail` sebagai waterfall chart: operatingRevenue → -COGS → grossProfit → -operatingExpenses → +nonOperatingIncome → -nonOperatingExpenses → netProfit.
- **Asset Book Value:** Tampilkan `currentBookValue` dengan progress bar vs `acquisitionCost` untuk visualisasi penyusutan.
- **Pajak Invoice:** Tambahkan dropdown "Withholding Tax" (PPh) di form invoice yang memanggil `GET /business/tax` (filter `isActive: true`). PPN tetap dihitung otomatis dari pengaturan perusahaan — dropdown ini hanya untuk pajak tambahan (PPh 21, PPh 23, dll.).

---

## 13. UPDATE — Pajak per Invoice (`taxConfigId` + `withholdingTaxAmount`)

> **Notes: update** — Fitur ini merupakan tambahan pada Phase 8. Invoice kini mendukung **dua lapisan pajak** yang terpisah.

### Desain Pajak Invoice

Invoice menerapkan dua pajak secara terpisah dan keduanya muncul di email:

| Pajak | Sumber | Diterapkan pada | Field |
|-------|--------|-----------------|-------|
| **PPN** | `company.taxEnabled` + `company.taxRate` | Per item yang `taxable: true` | `taxAmount` |
| **Withholding Tax** (PPh, dll.) | `taxConfigId` (opsional) | Subtotal invoice | `withholdingTaxAmount` |

```
subtotal            = Σ (qty × harga - diskon) per item
taxAmount (PPN)     = Σ (subtotal_item × company.taxRate) untuk item taxable
withholdingTaxAmount = subtotal × taxConfig.rate  (jika taxConfigId diisi)
totalAmount         = subtotal + taxAmount + withholdingTaxAmount
```

---

### 13.1 Buat Invoice dengan Withholding Tax

**`POST /business/invoices`** — Role: ADMIN+ | HTTP 201

> Dokumentasi lengkap endpoint ini ada di Phase sebelumnya. Berikut field tambahan yang tersedia.

**Field Tambahan di Request Body:**

| Field         | Tipe   | Wajib | Deskripsi |
|---------------|--------|-------|-----------|
| `taxConfigId` | string | Tidak | UUID TaxConfig (PPh 21, PPh 23, dll.) milik perusahaan. Diterapkan pada **subtotal** invoice. TaxConfig harus aktif. PPN tetap dihitung dari `company.taxEnabled` + `company.taxRate`. |

**Contoh Request Body:**
```json
{
  "contactId": "uuid-contact",
  "issueDate": "2026-03-28",
  "dueDate": "2026-04-28",
  "taxConfigId": "uuid-pph23-config",
  "items": [
    {
      "description": "Jasa Konsultasi",
      "quantity": 1,
      "unitPrice": 10000000,
      "taxable": true
    },
    {
      "description": "Biaya Transportasi",
      "quantity": 1,
      "unitPrice": 500000,
      "taxable": false
    }
  ]
}
```

**Contoh Response (201):**

> Asumsi: `company.taxEnabled = true`, `company.taxRate = 11`, `taxConfig.rate = 2` (PPh 23)

```json
{
  "id": "uuid-invoice",
  "invoiceNumber": "INV-2026-03-0001",
  "clientName": "PT Maju Bersama",
  "taxConfigId": "uuid-pph23-config",
  "subtotal": "10500000.00",
  "taxAmount": "1100000.00",
  "withholdingTaxAmount": "210000.00",
  "totalAmount": "11810000.00",
  "status": "DRAFT",
  "taxConfig": {
    "id": "uuid-pph23-config",
    "type": "PPH_23",
    "name": "PPh Pasal 23 - Jasa",
    "rate": "2.0000",
    "isActive": true
  },
  "items": [
    {
      "description": "Jasa Konsultasi",
      "quantity": "1.0000",
      "unitPrice": "10000000.00",
      "taxable": true,
      "taxRate": "11.00",
      "taxAmount": "1100000.00",
      "total": "11100000.00"
    },
    {
      "description": "Biaya Transportasi",
      "quantity": "1.0000",
      "unitPrice": "500000.00",
      "taxable": false,
      "taxRate": "0.00",
      "taxAmount": "0.00",
      "total": "500000.00"
    }
  ]
}
```

> **Kalkulasi:**
> - `subtotal` = 10.000.000 + 500.000 = **10.500.000**
> - `taxAmount` (PPN 11% dari item taxable) = 10.000.000 × 11% = **1.100.000**
> - `withholdingTaxAmount` (PPh 23 2% dari subtotal) = 10.500.000 × 2% = **210.000**
> - `totalAmount` = 10.500.000 + 1.100.000 + 210.000 = **11.810.000**

**Error spesifik:**

| Kondisi | HTTP | Pesan |
|---------|------|-------|
| `taxConfigId` tidak ditemukan di perusahaan ini | `404` | `Tax config not found in this company.` |
| TaxConfig tidak aktif | `400` | `Tax config is inactive.` |

---

### 13.2 Update Invoice — Ganti atau Hapus Withholding Tax

**`PUT /business/invoices/:id`** — Role: ADMIN+ | HTTP 200

> Hanya invoice berstatus **DRAFT** yang bisa diedit.

**Field Tambahan di Request Body:**

| Field         | Tipe          | Wajib | Deskripsi |
|---------------|---------------|-------|-----------|
| `taxConfigId` | string / null | Tidak | Kirim UUID untuk mengganti withholding tax. Kirim `null` untuk menghapus (tidak ada withholding tax, `withholdingTaxAmount` jadi 0). Jika tidak dikirim sama sekali, nilai tidak berubah. |

**Contoh — Set withholding tax:**
```json
{ "taxConfigId": "uuid-pph23-config" }
```

**Contoh — Hapus withholding tax:**
```json
{ "taxConfigId": null }
```

> **Catatan:** Jika `items` juga dikirim bersamaan, `taxAmount` dan `withholdingTaxAmount` akan dihitung ulang sesuai `taxConfigId` terbaru.

---

### 13.3 Detail Invoice (`GET /business/invoices/:id`) — Field Baru

**`GET /business/invoices/:id`** — Role: VIEWER+

Response kini menyertakan `taxConfig`, `withholdingTaxAmount`, dan `company` (PPN info):

```json
{
  "id": "uuid-invoice",
  "invoiceNumber": "INV-2026-03-0001",
  "subtotal": "10500000.00",
  "taxAmount": "1100000.00",
  "withholdingTaxAmount": "210000.00",
  "totalAmount": "11810000.00",
  "taxConfigId": "uuid-pph23-config",
  "taxConfig": {
    "id": "uuid-pph23-config",
    "type": "PPH_23",
    "name": "PPh Pasal 23 - Jasa",
    "rate": "2.0000",
    "isActive": true,
    "description": null
  },
  "company": {
    "taxEnabled": true,
    "taxRate": "11.00"
  },
  "contact": { "...": "..." },
  "items": [ { "...": "..." } ],
  "attachments": [],
  "paymentBankAccount": null
}
```

> **Gunakan `company.taxEnabled` + `company.taxRate`** untuk menampilkan label "PPN (11%)" di UI.
> Jika `taxConfigId` null, `withholdingTaxAmount` selalu `"0.00"`.

---

### 13.4 Tampilan Email Invoice — Dua Baris Pajak

Email yang dikirim ke klien menampilkan PPN dan withholding tax secara terpisah:

```
Subtotal                          Rp 10.500.000
PPN (11%)                          Rp  1.100.000
PPh Pasal 23 - Jasa (2%)          Rp    210.000
[badge: PPH 23 · PPh Pasal 23 - Jasa]
──────────────────────────────────────────────
Total                             Rp 11.810.000
```

- Baris **PPN** hanya muncul jika `company.taxEnabled = true` dan `taxAmount > 0`
- Baris **Withholding Tax** hanya muncul jika `withholdingTaxAmount > 0`
- Kolom pajak di tabel item selalu berlabel **"PPN"** (per-item menggunakan company rate)

---

### 13.5 Alur Jurnal Pembayaran Invoice

Saat invoice dibayar (`POST /business/invoices/:id/pay`) dan ada `taxAmount > 0`, sistem membuat baris jurnal pajak dengan nama dinamis dari TaxConfig:

```
DEBIT  Kas/Bank              → Rp 11.810.000  (total yang diterima)
CREDIT Pendapatan (4-001)    → Rp 11.810.000

Jika lunas + taxAmount > 0:
  DEBIT  Pendapatan (4-001)       → "PPh Pasal 23 - Jasa dari invoice INV-..."
  CREDIT Utang Pajak (2-002)      → "Utang PPh Pasal 23 - Jasa invoice INV-..."

Jika tidak ada taxConfig:
  DEBIT  Pendapatan               → "Pajak dari invoice INV-..."
  CREDIT Utang Pajak (2-002)      → "Utang Pajak invoice INV-..."
```
