# Business Plan - Phase 3 API Documentation

> **Contact CRUD + COA CRUD (+ Opening Balance) + Invoice Management**
>
> Dokumen ini berisi spesifikasi lengkap API untuk Fase 3 yang harus diimplementasikan di sisi frontend.
> Baca dokumen Phase 1 & Phase 2 terlebih dahulu sebelum dokumen ini.

---

## Base Setup & Autentikasi

Sama seperti Phase 1 & 2:

1. Semua endpoint memerlukan header `Authorization: Bearer <token>`.
2. User harus memiliki **subscription Business aktif** *atau* menjadi **member aktif** dari company yang OWNER-nya punya subscription Business — kecuali `POST /business/members/accept`.
3. Seluruh endpoint Phase 3 menggunakan company yang ditemukan otomatis dari JWT user (via `CompanyMemberGuard`).

---

## Ringkasan Endpoint Phase 3

| Method | Endpoint | Role Minimum | Keterangan |
|--------|----------|:------------:|------------|
| `GET` | `/business/chart-of-accounts` | `VIEWER` | List semua COA (dikelompokkan per tipe) |
| `GET` | `/business/chart-of-accounts/:id` | `VIEWER` | Detail satu COA |
| `POST` | `/business/chart-of-accounts` | `ADMIN` | Tambah COA custom |
| `PATCH` | `/business/chart-of-accounts/:id` | `ADMIN` | Edit COA custom |
| `DELETE` | `/business/chart-of-accounts/:id` | `ADMIN` | Hapus COA custom |
| `GET` | `/business/contacts` | `VIEWER` | List contacts (filter + pagination + search) |
| `GET` | `/business/contacts/:id` | `VIEWER` | Detail satu contact |
| `POST` | `/business/contacts` | `STAFF` | Tambah contact baru |
| `PUT` | `/business/contacts/:id` | `STAFF` | Update contact |
| `DELETE` | `/business/contacts/:id` | `ADMIN` | Hapus contact |
| `GET` | `/business/invoices` | `VIEWER` | List invoices (filter + pagination + search) |
| `GET` | `/business/invoices/:id` | `VIEWER` | Detail invoice beserta items & attachments |
| `POST` | `/business/invoices` | `STAFF` | Buat invoice baru (DRAFT) |
| `PUT` | `/business/invoices/:id` | `STAFF` | Edit invoice (DRAFT only) |
| `DELETE` | `/business/invoices/:id` | `STAFF` | Hapus invoice (DRAFT only) |
| `POST` | `/business/invoices/:id/send` | `STAFF` | Kirim invoice → status SENT + email otomatis |
| `POST` | `/business/invoices/:id/pay` | `ADMIN` | Bayar invoice (full atau partial) |
| `POST` | `/business/invoices/:id/duplicate` | `STAFF` | Duplikat invoice menjadi DRAFT baru |
| `GET` | `/business/invoices/:id/attachments` | `VIEWER` | List attachment invoice |
| `POST` | `/business/invoices/:id/attachments` | `STAFF` | Upload attachment ke invoice |
| `DELETE` | `/business/invoices/:id/attachments/:attachmentId` | `STAFF` | Hapus attachment |
| `PATCH` | `/business/company/logo` | `ADMIN` | Upload logo perusahaan |
| `DELETE` | `/business/company/logo` | `ADMIN` | Hapus logo perusahaan |
| `GET` | `/business/bank-accounts` | `VIEWER` | List rekening pemilik (urut: default dulu) |
| `GET` | `/business/bank-accounts/:id` | `VIEWER` | Detail satu rekening |
| `POST` | `/business/bank-accounts` | `ADMIN` | Tambah rekening pemilik |
| `PUT` | `/business/bank-accounts/:id` | `ADMIN` | Update rekening |
| `PATCH` | `/business/bank-accounts/:id/set-default` | `ADMIN` | Jadikan rekening default |
| `DELETE` | `/business/bank-accounts/:id` | `ADMIN` | Hapus rekening |

---

## 1. Chart of Accounts (COA)

> **Update dari Phase 1:** COA sekarang punya field `openingBalance` dan mendukung penuh CRUD untuk akun non-system.

### Aturan COA

| Kondisi | Edit | Hapus |
|---------|:----:|:-----:|
| `isSystem: true` (12 akun default) | ❌ | ❌ |
| `isSystem: false` + belum ada transaksi | ✅ | ✅ |
| `isSystem: false` + sudah ada transaksi | ✅ | ❌ |

> **Catatan frontend:** Sembunyikan/nonaktifkan tombol Edit & Delete untuk COA dengan `isSystem: true`. Untuk COA custom yang sudah punya transaksi, tampilkan tombol Edit tapi sembunyikan/nonaktifkan tombol Delete.

---

### 1.1 Get All COA

- **Endpoint:** `GET /business/chart-of-accounts`
- **Role minimum:** `VIEWER`
- **Response (200 OK):** Object dikelompokkan per tipe akun.
  ```json
  {
    "ASSET": [
      {
        "id": "uuid",
        "companyId": "uuid",
        "code": "1-001",
        "name": "Kas",
        "type": "ASSET",
        "openingBalance": "0.00",
        "isSystem": true,
        "createdAt": "2026-03-19T00:00:00.000Z",
        "updatedAt": "2026-03-19T00:00:00.000Z"
      }
    ],
    "LIABILITY": [...],
    "EQUITY": [...],
    "REVENUE": [...],
    "EXPENSE": [...]
  }
  ```

**Catatan frontend:**
- Tampilkan 5 grup terpisah (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE) — misalnya dengan tab atau section yang bisa di-collapse.
- COA diurutkan berdasarkan `code` secara ascending.

---

### 1.2 Get COA by ID

- **Endpoint:** `GET /business/chart-of-accounts/:id`
- **Role minimum:** `VIEWER`
- **Response (200 OK):** Objek COA tunggal.

---

### 1.3 Tambah COA Custom

- **Endpoint:** `POST /business/chart-of-accounts`
- **Role minimum:** `ADMIN`
- **Request Body:**
  ```json
  {
    "code": "string",          // Wajib — contoh: "5-004", harus unik di company ini
    "name": "string",          // Wajib
    "type": "string",          // Wajib — ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
    "openingBalance": number   // Opsional — default: 0
  }
  ```
- **Response (201 Created):** Objek COA baru dengan `isSystem: false`.

---

### 1.4 Edit COA Custom

- **Endpoint:** `PATCH /business/chart-of-accounts/:id`
- **Role minimum:** `ADMIN`
- **Request Body:** Semua field opsional.
  ```json
  {
    "name": "string",
    "type": "string",
    "openingBalance": number
  }
  ```
  > `code` tidak bisa diubah.

---

### 1.5 Hapus COA Custom

- **Endpoint:** `DELETE /business/chart-of-accounts/:id`
- **Role minimum:** `ADMIN`
- **Response (200 OK):** `{ "message": "Chart of account deleted." }`

---

## 2. Contacts

### Tipe Contact

| Tipe | Keterangan |
|------|-----------|
| `CUSTOMER` | Pelanggan |
| `VENDOR` | Pemasok / mitra bisnis |
| `EMPLOYEE` | Karyawan |

---

### 2.1 List Contacts

- **Endpoint:** `GET /business/contacts`
- **Role minimum:** `VIEWER`
- **Query Params:**

  | Param | Tipe | Contoh | Keterangan |
  |-------|------|--------|------------|
  | `type` | string | `CUSTOMER` | Opsional — filter by tipe |
  | `search` | string | `Budi` | Opsional — cari by nama, email, atau phone |
  | `page` | number | `1` | Opsional — default: 1 |
  | `limit` | number | `20` | Opsional — default: 20 |

- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "companyId": "uuid",
        "type": "CUSTOMER",
        "name": "Budi Santoso",
        "email": "budi@example.com",
        "phone": "08123456789",
        "address": "Jl. Mawar No.5, Jakarta",
        "bankName": "BCA",
        "bankAccountNumber": "1234567890",
        "bankAccountHolder": "Budi Santoso",
        "notes": "Pelanggan prioritas",
        "createdAt": "2026-03-19T00:00:00.000Z",
        "updatedAt": "2026-03-19T00:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
  ```

---

### 2.2 Get Contact by ID

- **Endpoint:** `GET /business/contacts/:id`
- **Role minimum:** `VIEWER`
- **Response (200 OK):** Objek Contact tunggal.

---

### 2.3 Tambah Contact

- **Endpoint:** `POST /business/contacts`
- **Role minimum:** `STAFF`
- **Request Body:**
  ```json
  {
    "type": "string",               // Wajib — CUSTOMER | VENDOR | EMPLOYEE
    "name": "string",               // Wajib
    "email": "string",              // Opsional
    "phone": "string",              // Opsional
    "address": "string",            // Opsional ← BARU
    "bankName": "string",           // Opsional
    "bankAccountNumber": "string",  // Opsional
    "bankAccountHolder": "string",  // Opsional
    "notes": "string"               // Opsional
  }
  ```
- **Response (201 Created):** Objek Contact baru.

**Catatan frontend:**
- Field `address` digunakan sebagai `clientAddress` di invoice saat Contact dipilih.

---

### 2.4 Update Contact

- **Endpoint:** `PUT /business/contacts/:id`
- **Role minimum:** `STAFF`
- **Request Body:** Sama seperti create, semua opsional.
- **Response (200 OK):** Objek Contact yang sudah diperbarui.

---

### 2.5 Hapus Contact

- **Endpoint:** `DELETE /business/contacts/:id`
- **Role minimum:** `ADMIN`
- **Response (200 OK):** `{ "message": "Contact deleted." }`

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Contact masih direferensikan oleh invoice atau transaksi bisnis |

---

## 3. Invoices

### Status Lifecycle Invoice

```
DRAFT ──► SENT ──► PAID
  │
  └──────────────────► OVERDUE  (otomatis via cron job harian)
```

| Status | Edit | Delete | Send | Pay |
|--------|:----:|:------:|:----:|:---:|
| DRAFT | ✅ | ✅ | ✅ | ❌ |
| SENT | ❌ | ❌ | ❌ | ✅ |
| OVERDUE | ❌ | ❌ | ❌ | ✅ |
| PAID | ❌ | ❌ | ❌ | ❌ |

### Format Nomor Invoice
`INV-{YYYY}-{MM}-{sequence}` — contoh: `INV-2026-03-0001`
Nomor di-generate otomatis oleh server.

---

### 3.1 List Invoices

- **Endpoint:** `GET /business/invoices`
- **Role minimum:** `VIEWER`
- **Query Params:**

  | Param | Tipe | Contoh | Keterangan |
  |-------|------|--------|------------|
  | `status` | string | `SENT` | Opsional — `DRAFT \| SENT \| PAID \| OVERDUE` |
  | `search` | string | `Budi` | Opsional — cari by invoiceNumber, clientName, clientEmail |
  | `startDate` | string | `2026-01-01` | Opsional — filter issueDate >= startDate |
  | `endDate` | string | `2026-03-31` | Opsional — filter issueDate <= endDate |
  | `contactId` | uuid | `uuid` | Opsional — filter by contact |
  | `page` | number | `1` | Opsional — default: 1 |
  | `limit` | number | `20` | Opsional — default: 20 |

- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "invoiceNumber": "INV-2026-03-0001",
        "clientName": "Budi Santoso",
        "clientEmail": "budi@example.com",
        "clientAddress": "Jl. Mawar No.5",
        "issueDate": "2026-03-19T00:00:00.000Z",
        "dueDate": "2026-04-19T00:00:00.000Z",
        "status": "SENT",
        "subtotal": "5000000.00",
        "taxAmount": "550000.00",
        "totalAmount": "5550000.00",
        "amountPaid": "0.00",
        "sentAt": "2026-03-19T08:00:00.000Z",
        "paidAt": null,
        "paymentDate": null,
        "paymentMethod": null,
        "paymentReference": null,
        "notes": null,
        "items": [...],
        "contact": { "id": "uuid", "name": "Budi Santoso", "type": "CUSTOMER" }
      }
    ],
    "total": 15,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
  ```

**Catatan frontend:**
- Tampilkan tab/filter: **Semua**, **Draft**, **Terkirim**, **Terlambat 🔴**, **Lunas**.
- Tampilkan `amountPaid` dan sisa (`totalAmount - amountPaid`) jika ada pembayaran parsial.

---

### 3.2 Get Invoice by ID

- **Endpoint:** `GET /business/invoices/:id`
- **Role minimum:** `VIEWER`
- **Response (200 OK):** Objek Invoice lengkap + `items` + `contact` + `attachments`.

---

### 3.3 Buat Invoice (DRAFT)

- **Endpoint:** `POST /business/invoices`
- **Role minimum:** `STAFF`
- **Request Body:**
  ```json
  {
    "contactId": "uuid",               // Opsional — jika diisi, clientName/clientEmail/clientAddress otomatis dari Contact
    "clientName": "Budi Santoso",      // Wajib JIKA contactId tidak diisi
    "clientEmail": "budi@example.com", // Opsional
    "clientAddress": "Jl. Mawar No.5", // Opsional
    "issueDate": "2026-03-19",         // Wajib
    "dueDate": "2026-04-19",           // Wajib
    "notes": "Terima kasih.",          // Opsional
    "paymentBankAccountId": "uuid",    // Opsional — rekening tujuan transfer untuk client
    "items": [
      {
        "description": "Jasa Konsultasi", // Wajib
        "quantity": 2,                    // Wajib
        "unitPrice": 2500000,             // Wajib
        "discountAmount": 0,              // Opsional — default: 0 ← BARU
        "taxable": true                   // Opsional — default: false
      }
    ]
  }
  ```

**Kalkulasi otomatis oleh server:**

```
item.lineAfterDiscount = quantity × unitPrice - discountAmount
item.taxAmount         = lineAfterDiscount × (taxRate / 100)  [jika taxable & taxEnabled]
item.total             = lineAfterDiscount + item.taxAmount

invoice.subtotal       = Σ(lineAfterDiscount per item)
invoice.taxAmount      = Σ(item.taxAmount)
invoice.totalAmount    = subtotal + taxAmount
```

- **Response (201 Created):** Objek Invoice + `items`.

---

### 3.4 Edit Invoice

Hanya invoice berstatus **DRAFT**.

- **Endpoint:** `PUT /business/invoices/:id`
- **Role minimum:** `STAFF`
- **Request Body:** Semua field opsional (sama seperti create, termasuk `discountAmount` per item).
- **Response (200 OK):** Objek Invoice yang sudah diperbarui + `items`.

---

### 3.5 Hapus Invoice

Hanya invoice berstatus **DRAFT**.

- **Endpoint:** `DELETE /business/invoices/:id`
- **Role minimum:** `STAFF`
- **Response (200 OK):** `{ "message": "Invoice INV-2026-03-0001 deleted." }`

> Semua attachment yang terkait juga dihapus otomatis dari storage.

---

### 3.6 Kirim Invoice (DRAFT → SENT)

- **Endpoint:** `POST /business/invoices/:id/send`
- **Role minimum:** `STAFF`
- **Request Body:** Tidak ada.
- **Response (200 OK):** Objek Invoice dengan `status: "SENT"` dan `sentAt` terisi.

**Perilaku server:**
- Status berubah ke `SENT`, field `sentAt` diisi timestamp sekarang.
- Jika `clientEmail` terisi → **email otomatis dikirim** ke client via Resend.

**Catatan frontend:**
- Tampilkan dialog konfirmasi sebelum kirim.
- Setelah berhasil, tampilkan info: *"Invoice telah dikirim. Email notifikasi dikirim ke [clientEmail]."* (jika ada email).

---

### 3.7 Bayar Invoice (Full atau Partial)

- **Endpoint:** `POST /business/invoices/:id/pay`
- **Role minimum:** `ADMIN`
- **Request Body:**
  ```json
  {
    "paymentCoaId": "uuid",         // Wajib — COA Kas/Bank tempat uang diterima
    "paymentDate": "2026-03-25",    // Wajib
    "amount": 2500000,              // Opsional ← BARU — jika tidak diisi, bayar sisa penuh
    "paymentMethod": "Transfer",    // Opsional ← BARU — contoh: "Transfer", "Cash", "Cek"
    "paymentReference": "TRF-001"   // Opsional ← BARU — nomor bukti transfer, dll.
  }
  ```

**Logika server:**
- Jika `amount` tidak diisi → bayar seluruh sisa (`totalAmount - amountPaid`).
- `amountPaid` bertambah sebesar `amount` yang dibayar.
- Jika `amountPaid >= totalAmount` → status `PAID`, `paidAt` diisi.
- Jika masih kurang → status tetap `SENT`/`OVERDUE`, `amountPaid` diperbarui.
- `paymentCoaId`, `paymentDate`, `paymentMethod`, `paymentReference` disimpan di invoice (selalu diperbarui ke pembayaran terakhir).
- Jurnal double-entry dibuat per pembayaran. Jurnal PPN **hanya dibuat saat lunas penuh**.

**Response (200 OK) — Lunas Penuh:**
```json
{ "message": "Invoice INV-2026-03-0001 marked as PAID." }
```

**Response (200 OK) — Pembayaran Parsial:**
```json
{
  "message": "Partial payment of 2500000 recorded. Remaining balance: 3050000.",
  "amountPaid": "2500000.00",
  "remaining": "3050000.00"
}
```

**Catatan frontend:**
- Tampilkan sisa tagihan (`totalAmount - amountPaid`) di halaman detail invoice.
- Untuk input `paymentCoaId`, filter COA ke tipe `ASSET` saja.
- Tampilkan dialog konfirmasi + summary jurnal sebelum submit.

---

### 3.8 Duplikat Invoice ← BARU

- **Endpoint:** `POST /business/invoices/:id/duplicate`
- **Role minimum:** `STAFF`
- **Request Body:** Tidak ada.
- **Response (201 Created):** Objek Invoice baru (DRAFT) dengan:
  - Nomor invoice baru (auto-generated)
  - `issueDate` = hari ini
  - `dueDate` = hari ini + 30 hari
  - Semua item, contact, dan notes disalin dari sumber
  - `amountPaid: 0`, `sentAt: null`, `paidAt: null`

**Catatan frontend:**
- Tampilkan tombol **"Duplikat"** di halaman detail invoice (semua status).
- Setelah duplikat berhasil, arahkan user ke halaman edit invoice baru.

---

## 4. Invoice Attachments ← BARU

Lampiran file untuk invoice (bukti PO, kontrak, bukti transfer, dll.).

### 4.1 List Attachments

- **Endpoint:** `GET /business/invoices/:id/attachments`
- **Role minimum:** `VIEWER`
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "invoiceId": "uuid",
      "fileName": "purchase-order.pdf",
      "fileUrl": "/invoice-attachments/...",
      "fileSize": 204800,
      "mimeType": "application/pdf",
      "uploadedByUserId": "uuid",
      "createdAt": "2026-03-19T00:00:00.000Z"
    }
  ]
  ```

---

### 4.2 Upload Attachment

- **Endpoint:** `POST /business/invoices/:id/attachments`
- **Role minimum:** `STAFF`
- **Request:** `multipart/form-data`, field name: `file`
- **Format yang diterima:** JPEG, PNG, JPG, WebP, PDF
- **Ukuran maksimal:** 10MB
- **Response (201 Created):** Objek `InvoiceAttachment` baru.

**Catatan frontend:**
- Tidak ada batasan jumlah attachment per invoice.
- Tampilkan progress upload jika file besar.
- Setelah upload, tampilkan daftar attachment di halaman detail invoice.

---

### 4.3 Hapus Attachment

- **Endpoint:** `DELETE /business/invoices/:id/attachments/:attachmentId`
- **Role minimum:** `STAFF`
- **Response (200 OK):** `{ "message": "Attachment deleted." }`

---

## 5. Company Logo ← BARU

### 5.1 Upload Logo

- **Endpoint:** `PATCH /business/company/logo`
- **Role minimum:** `ADMIN`
- **Request:** `multipart/form-data`, field name: `file`
- **Format yang diterima:** JPEG, PNG, JPG, WebP
- **Ukuran maksimal:** 2MB
- **Response (200 OK):** Objek Company terbaru (dengan `logoUrl` baru).

**Catatan frontend:**
- Jika sudah ada logo sebelumnya, otomatis dihapus dan diganti.
- Tampilkan preview logo saat user memilih file sebelum upload.
- Field `logoUrl` di response `GET /business/company` sudah berisi **presigned URL MinIO** yang siap dipakai langsung di `<img src>`. URL valid selama 7 hari.

---

### 5.2 Hapus Logo

- **Endpoint:** `DELETE /business/company/logo`
- **Role minimum:** `ADMIN`
- **Response (200 OK):** Objek Company dengan `logoUrl: null`.

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Company belum memiliki logo |

---

## 6. Company Bank Accounts ← BARU

Rekening pemilik yang ditampilkan di invoice agar client tahu kemana harus mentransfer pembayaran. Satu company bisa punya lebih dari satu rekening.

### 6.1 List Rekening

- **Endpoint:** `GET /business/bank-accounts`
- **Role minimum:** `VIEWER`
- **Response (200 OK):**
  ```json
  [
    {
      "id": "uuid",
      "companyId": "uuid",
      "bankName": "BCA",
      "accountNumber": "1234567890",
      "accountHolder": "PT Maju Bersama",
      "isDefault": true,
      "createdAt": "2026-03-19T00:00:00.000Z",
      "updatedAt": "2026-03-19T00:00:00.000Z"
    }
  ]
  ```

> Rekening dengan `isDefault: true` ditampilkan paling atas.

---

### 6.2 Get Rekening by ID

- **Endpoint:** `GET /business/bank-accounts/:id`
- **Role minimum:** `VIEWER`
- **Response (200 OK):** Objek `CompanyBankAccount` tunggal.

---

### 6.3 Tambah Rekening

- **Endpoint:** `POST /business/bank-accounts`
- **Role minimum:** `ADMIN`
- **Request Body:**
  ```json
  {
    "bankName": "string",       // Wajib — contoh: "BCA", "Mandiri"
    "accountNumber": "string",  // Wajib
    "accountHolder": "string",  // Wajib — nama pemilik rekening
    "isDefault": true           // Opsional — jika true, rekening lain di-unset otomatis
  }
  ```
- **Response (201 Created):** Objek `CompanyBankAccount` baru.

---

### 6.4 Update Rekening

- **Endpoint:** `PUT /business/bank-accounts/:id`
- **Role minimum:** `ADMIN`
- **Request Body:** Semua field opsional (sama seperti create).
- **Response (200 OK):** Objek `CompanyBankAccount` yang sudah diperbarui.

---

### 6.5 Set Default Rekening

- **Endpoint:** `PATCH /business/bank-accounts/:id/set-default`
- **Role minimum:** `ADMIN`
- **Request Body:** Tidak ada.
- **Response (200 OK):** Objek `CompanyBankAccount` dengan `isDefault: true`. Rekening lain otomatis menjadi `isDefault: false`.

---

### 6.6 Hapus Rekening

- **Endpoint:** `DELETE /business/bank-accounts/:id`
- **Role minimum:** `ADMIN`
- **Response (200 OK):** `{ "message": "Bank account deleted." }`

---

**Catatan frontend:**
- Saat membuat/mengedit invoice, tampilkan dropdown rekening dari `GET /business/bank-accounts` untuk field `paymentBankAccountId`.
- Rekening dengan `isDefault: true` bisa langsung dipilih sebagai default di dropdown.
- Di halaman detail invoice (setelah GET `/business/invoices/:id`), tampilkan info rekening dari field `paymentBankAccount` jika ada.

---

## 7. Referensi: Tipe Data

### Objek `Contact` (diperbarui)

```typescript
{
  id: string;
  companyId: string;
  type: "CUSTOMER" | "VENDOR" | "EMPLOYEE";
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;        // ← BARU
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
```

### Objek `Invoice` (diperbarui)

```typescript
{
  id: string;
  companyId: string;
  contactId: string | null;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  issueDate: string;
  dueDate: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE";
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  amountPaid: string;            // ← BARU — default "0.00"
  sentAt: string | null;         // ← BARU — timestamp saat SENT
  paidAt: string | null;         // ← BARU — timestamp saat PAID
  paymentDate: string | null;    // ← BARU — tanggal pembayaran terakhir
  paymentCoaId: string | null;   // ← BARU — COA yang digunakan untuk bayar
  paymentMethod: string | null;  // ← BARU — contoh: "Transfer", "Cash"
  paymentReference: string | null; // ← BARU — nomor bukti transfer, dll.
  paymentBankAccountId: string | null; // ← BARU — rekening tujuan transfer
  notes: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItem[];
  attachments: InvoiceAttachment[]; // ← BARU — hanya di GET detail
  contact: Contact | null;
  paymentBankAccount: CompanyBankAccount | null; // ← BARU — hanya di GET detail
}
```

### Objek `InvoiceItem` (diperbarui)

```typescript
{
  id: string;
  invoiceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;   // ← BARU — default "0.00"
  taxable: boolean;
  taxRate: string;
  taxAmount: string;
  total: string;            // = (qty × price - discount) + taxAmount
}
```

### Objek `InvoiceAttachment` ← BARU

```typescript
{
  id: string;
  invoiceId: string;
  fileName: string;          // nama file asli
  fileUrl: string;           // path di MinIO storage
  fileSize: number;          // dalam bytes
  mimeType: string;
  uploadedByUserId: string;
  createdAt: string;
}
```

### Objek `CompanyBankAccount` ← BARU

```typescript
{
  id: string;
  companyId: string;
  bankName: string;          // contoh: "BCA", "Mandiri"
  accountNumber: string;
  accountHolder: string;     // nama pemilik rekening
  isDefault: boolean;        // true = rekening utama
  createdAt: string;
  updatedAt: string;
}
```

> **Penting:** Semua field `Decimal` dikembalikan sebagai **string**. Parse ke `number` atau gunakan `decimal.js` / `big.js` untuk operasi aritmetika.

---

## 8. Panduan UI/UX

### Kontrol per Role (diperbarui)

| Aksi | VIEWER | STAFF | ADMIN | OWNER |
|------|:------:|:-----:|:-----:|:-----:|
| Lihat COA, Contact, Invoice | ✅ | ✅ | ✅ | ✅ |
| Tambah/Edit Contact | ❌ | ✅ | ✅ | ✅ |
| Hapus Contact | ❌ | ❌ | ✅ | ✅ |
| Tambah/Edit COA custom | ❌ | ❌ | ✅ | ✅ |
| Hapus COA custom | ❌ | ❌ | ✅ | ✅ |
| Buat/Edit/Delete Invoice (DRAFT) | ❌ | ✅ | ✅ | ✅ |
| Kirim Invoice (DRAFT→SENT) | ❌ | ✅ | ✅ | ✅ |
| Duplikat Invoice | ❌ | ✅ | ✅ | ✅ |
| Upload/Hapus Attachment | ❌ | ✅ | ✅ | ✅ |
| Bayar Invoice (Full/Partial) | ❌ | ❌ | ✅ | ✅ |
| Upload/Hapus Logo Company | ❌ | ❌ | ✅ | ✅ |
| Lihat Rekening Company | ✅ | ✅ | ✅ | ✅ |
| Tambah/Edit/Hapus Rekening Company | ❌ | ❌ | ✅ | ✅ |

### Partial Payment UI

```
┌─────────────────────────────────────────┐
│  Invoice INV-2026-03-0001               │
│  Total        : Rp 5.550.000            │
│  Sudah Dibayar: Rp 2.500.000  ████░░░░  │
│  Sisa         : Rp 3.050.000            │
│                            [Bayar Lagi] │
└─────────────────────────────────────────┘
```

---

## 9. Contoh Alur Lengkap: Invoice dengan Rekening & Partial Payment

```
0. (Opsional) Tambah rekening pemilik
   POST /business/bank-accounts
   → { bankName: "BCA", accountNumber: "1234567890", accountHolder: "PT Maju", isDefault: true }
   → bankAccountId = "uuid-bank-acc"

1. Buat Contact customer
   POST /business/contacts
   → { type: "CUSTOMER", name: "Budi", address: "Jl. Mawar" }
   → contactId = "uuid-budi"

2. Buat Invoice DRAFT (dengan rekening tujuan transfer)
   POST /business/invoices
   → { contactId: "uuid-budi", paymentBankAccountId: "uuid-bank-acc", items: [{ discountAmount: 50000, ... }] }
   → invoiceId = "uuid-inv"

3. Kirim Invoice
   POST /business/invoices/uuid-inv/send
   → status: SENT, sentAt: now
   → Email otomatis terkirim ke budi@example.com

4. Pembayaran Pertama (Partial)
   POST /business/invoices/uuid-inv/pay
   → { paymentCoaId: "uuid-bank", paymentDate: "2026-03-25", amount: 2500000,
       paymentMethod: "Transfer", paymentReference: "TRF-001" }
   → amountPaid: 2.500.000, status tetap SENT

5. Pembayaran Kedua (Lunas)
   POST /business/invoices/uuid-inv/pay
   → { paymentCoaId: "uuid-bank", paymentDate: "2026-04-01" }  // amount kosong = bayar sisa
   → status: PAID, paidAt: now
   → Jurnal double-entry + jurnal PPN (jika ada) terbuat otomatis
```

---

*End of Document — Phase 3 Frontend API Docs — v2.1 — 2026-03-20*
