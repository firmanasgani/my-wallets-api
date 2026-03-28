# Business Plan - Phase 4 API Documentation

> **Business Transactions (Compound Double-Entry) + Manual Journal Entry**
>
> Dokumen ini berisi spesifikasi lengkap API untuk Fase 4 yang harus diimplementasikan di sisi frontend.
> Baca dokumen Phase 1, 2, & 3 terlebih dahulu sebelum dokumen ini.

---

## Base Setup & Autentikasi

Sama seperti Phase 1, 2, & 3:

1. Semua endpoint memerlukan header `Authorization: Bearer <token>`.
2. User harus memiliki **subscription Business aktif** *atau* menjadi **member aktif** dari company yang OWNER-nya punya subscription Business.
3. Seluruh endpoint Phase 4 menggunakan company yang ditemukan otomatis dari JWT user (via `CompanyMemberGuard`).

---

## Ringkasan Endpoint Phase 4

| Method | Endpoint | Role Minimum | Keterangan |
|--------|----------|:------------:|------------|
| `GET` | `/business/transactions` | `VIEWER` | List semua jurnal (filter + pagination) |
| `POST` | `/business/transactions` | `STAFF` | Input jurnal manual (compound double-entry) |
| `DELETE` | `/business/transactions/:id` | `ADMIN` | Hapus jurnal manual |

---

## Perubahan Model dari MVP Plan

> **Catatan implementasi:** Model `BusinessTransaction` (1 debit + 1 credit) di `BUSINESS_MVP_PLAN.md` section 3.7 **digantikan** dengan struktur compound berikut:
>
> | Model | Deskripsi |
> |-------|-----------|
> | `JournalEntry` | Header transaksi (description, date, invoiceId, isSystemGenerated) |
> | `JournalLine` | Baris detail: 1 baris = 1 akun COA + type DEBIT/CREDIT + amount |
>
> Satu `JournalEntry` memiliki **minimal 2 `JournalLine`** (1 DEBIT + 1 CREDIT), dan bisa lebih (compound entry).

---

## Konsep: Compound Double-Entry Bookkeeping

Implementasi Phase 4 menggunakan **Compound Journal Entry**, bukan simple 1-debit-1-credit.

### Perbedaan Simple vs Compound

| | Simple (MVP Plan awal) | Compound (implementasi aktual) |
|--|--------------------|---------------------------------|
| Struktur | 1 debit + 1 credit | N debit + N credit |
| Bayar gaji 1 orang | ✅ | ✅ |
| Bayar gaji 3 orang dari 2 rekening berbeda | ❌ | ✅ |
| Invoice dengan diskon (split akun) | ❌ | ✅ |
| Invoice lunas dengan PPN (4 baris jurnal) | ❌ | ✅ |

**Aturan wajib:** `Σ semua baris DEBIT = Σ semua baris CREDIT`

### Struktur Data

Setiap transaksi terdiri dari dua layer:

```
JournalEntry (header)          → satu entri per transaksi
  └── JournalLine[] (baris)    → satu baris per akun yang terlibat
        ├── line 1: coaId, type=DEBIT,  amount, contactId?
        ├── line 2: coaId, type=CREDIT, amount, contactId?
        └── line N: ...
```

### Contoh Kasus Umum

| Kasus | Baris DEBIT | Baris CREDIT |
|-------|-------------|--------------|
| Bayar gaji karyawan | `5-002 Beban Gaji` | `1-002 Bank` |
| Bayar sewa kantor | `5-003 Beban Sewa` | `1-001 Kas` |
| Setoran modal pemilik | `1-002 Bank` | `3-001 Modal Pemilik` |
| Terima pembayaran piutang | `1-002 Bank` | `1-003 Piutang Usaha` |
| Bayar gaji 2 karyawan (Andi + Budi) dari Bank | `5-002 Beban Gaji` (Andi, 5jt) + `5-002 Beban Gaji` (Budi, 3jt) | `1-002 Bank` (8jt) |

> **Penting:** Jurnal yang berasal dari pembayaran invoice **dibuat otomatis oleh server** (Phase 3). Endpoint di Phase 4 hanya untuk input **manual** di luar invoice.

---

## Jurnal Otomatis dari Pembayaran Invoice

Saat endpoint `POST /business/invoices/:id/pay` dipanggil (Phase 3), server **otomatis membuat satu `JournalEntry`** dengan `isSystemGenerated: true`. Struktur jurnal tergantung apakah pembayaran lunas dan apakah ada PPN.

### Kasus 1: Pembayaran Tanpa PPN (atau PPN = 0)

```
Debit  : [paymentCoaId] Bank/Kas               Rp X   (penerimaan dari invoice)
Credit : [4-001] Pendapatan Penjualan           Rp X
```

### Kasus 2: Pembayaran Parsial (Belum Lunas)

Jurnal dibuat sama seperti Kasus 1, namun invoice tetap berstatus `SENT` / `OVERDUE`. Jurnal PPN **tidak dibuat** karena invoice belum lunas.

```
Debit  : [paymentCoaId] Bank/Kas               Rp X   (jumlah yang dibayar sekarang)
Credit : [4-001] Pendapatan Penjualan           Rp X
```

### Kasus 3: Pelunasan Penuh dengan PPN (`taxAmount > 0`)

Server membuat **satu JournalEntry dengan 4 baris** dalam satu transaksi atomik:

```
Debit  : [paymentCoaId] Bank/Kas               Rp Total   (penerimaan kas)
Credit : [4-001] Pendapatan Penjualan           Rp Total   (pengakuan pendapatan)
Debit  : [4-001] Pendapatan Penjualan           Rp PPN     (koreksi pendapatan → reklasifikasi PPN)
Credit : [2-002] Hutang Pajak PPN               Rp PPN     (kewajiban pajak timbul)
```

> **Logika reklasifikasi PPN:** Pendapatan yang diakui adalah pendapatan *neto* (sudah dikurangi PPN). Baris 3 dan 4 memindahkan porsi PPN dari Pendapatan ke Utang Pajak, sehingga saldo `4-001` mencerminkan pendapatan bersih (di luar PPN).

**Contoh angka** — Invoice Rp 5.000.000 + PPN 11% = Total Rp 5.550.000:

```
Debit  : 1-002 Bank                   Rp 5.550.000
Credit : 4-001 Pendapatan Penjualan   Rp 5.550.000
Debit  : 4-001 Pendapatan Penjualan   Rp   550.000
Credit : 2-002 Hutang Pajak PPN       Rp   550.000
─────────────────────────────────────────────────
Total Debit  : Rp 6.100.000  ✓ Balance  Total Credit : Rp 6.100.000
```

**Kondisi jurnal PPN dibuat:** hanya saat invoice **lunas penuh** (`amountPaid >= totalAmount`) **dan** `invoice.taxAmount > 0` **dan** COA `2-002` ada di company.

---

## Sumber Transaksi

| `isSystemGenerated` | `invoiceId` | Sumber | Bisa Dihapus Manual? |
|:-------------------:|:-----------:|--------|:--------------------:|
| `false` | `null` | Input manual (Phase 4) | ✅ |
| `true` | terisi | Otomatis dari invoice (pembayaran penuh/parsial) | ❌ |

> Gunakan field `isSystemGenerated` di response untuk membedakan jurnal manual vs otomatis. Sembunyikan/nonaktifkan tombol Delete jika `isSystemGenerated === true`.

---

## 1. Business Transactions (Journal Entries)

### 1.1 List Jurnal

- **Endpoint:** `GET /business/transactions`
- **Role minimum:** `VIEWER`
- **Query Params:**

  | Param | Tipe | Contoh | Keterangan |
  |-------|------|--------|------------|
  | `startDate` | string | `2026-01-01` | Opsional — filter `transactionDate >= startDate` |
  | `endDate` | string | `2026-03-31` | Opsional — filter `transactionDate <= endDate` |
  | `coaId` | uuid | `uuid` | Opsional — filter jurnal yang punya baris COA ini (debit atau credit) |
  | `contactId` | uuid | `uuid` | Opsional — filter by contact (di salah satu baris) |
  | `page` | number | `1` | Opsional — default: 1 |
  | `limit` | number | `20` | Opsional — default: 20, max: 100 |

- **Response (200 OK):**
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "companyId": "uuid",
        "invoiceId": null,
        "isSystemGenerated": false,
        "transactionDate": "2026-03-25T00:00:00.000Z",
        "description": "Gaji Maret",
        "lines": [
          {
            "id": "uuid",
            "type": "DEBIT",
            "amount": "5000000.00",
            "description": "Gaji Andi",
            "coa": {
              "id": "uuid",
              "code": "5-002",
              "name": "Beban Gaji",
              "type": "EXPENSE"
            },
            "contact": {
              "id": "uuid",
              "name": "Andi Pratama",
              "type": "EMPLOYEE"
            }
          },
          {
            "id": "uuid",
            "type": "CREDIT",
            "amount": "5000000.00",
            "description": null,
            "coa": {
              "id": "uuid",
              "code": "1-002",
              "name": "Bank",
              "type": "ASSET"
            },
            "contact": null
          }
        ],
        "invoice": null,
        "createdByUserId": "uuid",
        "createdAt": "2026-03-25T08:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
  ```

**Catatan frontend:**
- Data diurutkan berdasarkan `transactionDate` terbaru dulu, lalu `createdAt` terbaru.
- Di dalam `lines`, baris DEBIT selalu muncul sebelum CREDIT (diurutkan server: `type asc, amount desc`).
- Jika `isSystemGenerated === true`, tampilkan badge **"Dari Invoice"** dan `invoice.invoiceNumber` sebagai referensi.
- Gunakan filter `coaId` untuk menampilkan **Buku Besar** per akun (lihat section 2).

---

### 1.2 Buat Jurnal Manual

- **Endpoint:** `POST /business/transactions`
- **Role minimum:** `STAFF`
- **Request Body:**
  ```json
  {
    "description": "Gaji Maret",
    "transactionDate": "2026-03-25",
    "lines": [
      {
        "coaId": "uuid-beban-gaji",
        "type": "DEBIT",
        "amount": 5000000,
        "description": "Gaji Andi",
        "contactId": "uuid-andi"
      },
      {
        "coaId": "uuid-bank",
        "type": "CREDIT",
        "amount": 5000000
      }
    ]
  }
  ```

  **Field `lines` (per baris):**

  | Field | Tipe | Wajib | Keterangan |
  |-------|------|:-----:|------------|
  | `coaId` | uuid | ✅ | Akun COA yang terlibat |
  | `type` | `"DEBIT"` \| `"CREDIT"` | ✅ | Jenis baris |
  | `amount` | number | ✅ | Positif, max 2 desimal |
  | `description` | string | ❌ | Keterangan per baris (opsional) |
  | `contactId` | uuid | ❌ | Pihak terkait (Customer/Vendor/Employee) |

  **Aturan:**
  - Minimal 2 baris (1 DEBIT + 1 CREDIT)
  - `Σ amount baris DEBIT = Σ amount baris CREDIT`
  - Semua `coaId` harus ada di company ini
  - Semua `contactId` (jika diisi) harus ada di company ini

- **Response (201 Created):** Objek `JournalEntry` baru beserta semua `lines`.

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Tidak ada baris DEBIT atau tidak ada baris CREDIT |
| `400` | Total debit ≠ total credit |
| `400` | `amount` tidak positif atau melebihi 2 desimal |
| `404` | Salah satu `coaId` tidak ditemukan di company ini |
| `404` | Salah satu `contactId` tidak ditemukan di company ini |

**Catatan frontend:**
- Untuk dropdown **COA**, gunakan data dari `GET /business/chart-of-accounts`. Tampilkan dalam format: `[code] nama` — contoh: `5-002 Beban Gaji`.
- Untuk dropdown **Contact**, gunakan data dari `GET /business/contacts`.
- Validasi sisi frontend: hitung total DEBIT dan total CREDIT secara real-time dan tampilkan indikator balance sebelum submit.
- Tampilkan dialog konfirmasi berisi preview jurnal sebelum submit:
  ```
  Debit  : 5-002 Beban Gaji   Rp 5.000.000  (Andi Pratama)
  Credit : 1-002 Bank         Rp 5.000.000
  ─────────────────────────────────────────
  Total  : Rp 5.000.000  ✓ Balance
  ```

---

### 1.3 Hapus Jurnal Manual

- **Endpoint:** `DELETE /business/transactions/:id`
- **Role minimum:** `ADMIN`
- **Response (200 OK):** `{ "message": "Journal entry deleted." }`

**Error yang mungkin terjadi:**

| HTTP Status | Kondisi |
|:-----------:|---------|
| `400` | Jurnal berasal dari invoice (`isSystemGenerated: true`) — tidak bisa dihapus manual |
| `404` | Jurnal tidak ditemukan |

**Catatan frontend:**
- Tampilkan tombol Delete **hanya** jika `isSystemGenerated === false`.
- Tampilkan dialog konfirmasi sebelum hapus.

---

## 2. Panduan: Buku Besar per COA

> **Catatan implementasi:** MVP Plan section 8 mendefinisikan endpoint server-side `GET /business/chart-of-accounts/:id/ledger`. Endpoint tersebut **tidak diimplementasikan** — sebagai gantinya, Buku Besar dibangun di sisi frontend menggunakan filter `coaId` pada endpoint transactions. Pendekatan ini lebih fleksibel karena frontend bisa mengatur pagination, range tanggal, dan tampilan saldo berjalan secara mandiri.

Fitur **Buku Besar** (General Ledger) menampilkan riwayat pergerakan saldo suatu akun COA. Implementasikan di frontend menggunakan endpoint `GET /business/transactions` dengan filter `coaId`.

### Cara Hitung Saldo Berjalan

Karena satu jurnal bisa punya banyak baris, iterasi `lines` dari setiap `JournalEntry`, lalu cari baris yang `coa.id === coaId` yang sedang ditampilkan:

```
Untuk setiap JournalEntry:
  Untuk setiap line di entry.lines:
    jika line.coaId === coaId yang dipilih:
      jika line.type === "DEBIT"  → tampilkan di kolom Debit
      jika line.type === "CREDIT" → tampilkan di kolom Credit
```

Logika saldo tergantung pada **normal balance** tipe COA:

| Tipe COA | Normal Balance | Rumus Saldo |
|----------|:--------------:|-------------|
| `ASSET` | Debit | `openingBalance + Σdebit - Σcredit` |
| `EXPENSE` | Debit | `openingBalance + Σdebit - Σcredit` |
| `LIABILITY` | Credit | `openingBalance - Σdebit + Σcredit` |
| `EQUITY` | Credit | `openingBalance - Σdebit + Σcredit` |
| `REVENUE` | Credit | `openingBalance - Σdebit + Σcredit` |

### Format Tampilan Buku Besar

```
Akun: 1-002 Bank
Opening Balance: Rp 10.000.000

┌────────────┬──────────────────────┬────────────┬────────────┬─────────────┐
│ Tanggal    │ Keterangan           │ Debit      │ Credit     │ Saldo       │
├────────────┼──────────────────────┼────────────┼────────────┼─────────────┤
│            │ Saldo Awal           │            │            │ 10.000.000  │
│ 2026-03-19 │ Penerimaan Invoice   │  5.550.000 │            │ 15.550.000  │
│ 2026-03-25 │ Gaji Maret - Andi   │            │  5.000.000 │ 10.550.000  │
└────────────┴──────────────────────┴────────────┴────────────┴─────────────┘
Closing Balance: Rp 10.550.000
```

> **Catatan:** Kolom "Keterangan" diambil dari `line.description` jika ada, fallback ke `entry.description`.

### Cara Implementasi di Frontend

```
1. GET /business/chart-of-accounts/:id
   → Ambil openingBalance dan type COA

2. GET /business/transactions?coaId=<id>&startDate=&endDate=&limit=100
   → Ambil semua jurnal yang punya baris COA ini

3. Untuk setiap JournalEntry di data[]:
   a. Cari di entry.lines baris yang coaId-nya cocok
   b. Ambil line.type (DEBIT/CREDIT) dan line.amount
   c. Hitung saldo berjalan sesuai rumus normal balance di atas

4. Tampilkan di tabel dengan saldo berjalan per baris
```

---

## 3. Referensi: Tipe Data

### Objek `JournalEntry`

```typescript
{
  id: string;
  companyId: string;
  invoiceId: string | null;         // null = jurnal manual; terisi = dari invoice
  isSystemGenerated: boolean;       // false = manual; true = dari invoice (tidak bisa dihapus)
  transactionDate: string;          // ISO 8601 datetime
  description: string;
  createdByUserId: string;
  createdAt: string;

  // Relasi (selalu disertakan di response)
  lines: JournalLine[];
  invoice: InvoiceSummary | null;   // hanya di GET list
}
```

### Objek `JournalLine`

```typescript
{
  id: string;
  journalEntryId: string;
  type: "DEBIT" | "CREDIT";
  amount: string;                   // Decimal sebagai string
  description: string | null;       // keterangan per baris (opsional)
  coaId: string;
  contactId: string | null;

  // Relasi (selalu disertakan di response)
  coa: CoaSummary;
  contact: ContactSummary | null;
}
```

### Objek `CoaSummary`

```typescript
{
  id: string;
  code: string;    // contoh: "5-002"
  name: string;    // contoh: "Beban Gaji"
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
}
```

### Objek `ContactSummary`

```typescript
{
  id: string;
  name: string;
  type: "CUSTOMER" | "VENDOR" | "EMPLOYEE";
}
```

### Objek `InvoiceSummary`

```typescript
{
  id: string;
  invoiceNumber: string;  // contoh: "INV-2026-03-0001"
}
```

> **Penting:** Field `amount` di `JournalLine` dikembalikan sebagai **string** (Decimal). Parse ke `number` atau gunakan `decimal.js` / `big.js` untuk operasi aritmetika.

---

## 4. Panduan UI/UX

### Kontrol per Role

| Aksi | VIEWER | STAFF | ADMIN | OWNER |
|------|:------:|:-----:|:-----:|:-----:|
| Lihat daftar jurnal | ✅ | ✅ | ✅ | ✅ |
| Input jurnal manual | ❌ | ✅ | ✅ | ✅ |
| Hapus jurnal manual | ❌ | ❌ | ✅ | ✅ |

### Label Sumber Transaksi

```
┌────────────────────────────────────────────────────────────┐
│ [Dari Invoice INV-2026-03-0001]  Penerimaan dari Budi      │  ← isSystemGenerated: true
│ [Manual]                         Gaji Maret - Andi         │  ← isSystemGenerated: false
└────────────────────────────────────────────────────────────┘
```

- `isSystemGenerated: true` → badge biru, link ke detail invoice, **tanpa tombol Delete**.
- `isSystemGenerated: false` → badge abu-abu, tombol Delete tersedia (khusus ADMIN/OWNER).

### Form Input Jurnal Manual

UI mendukung penambahan baris dinamis (compound entry):

```
┌─────────────────────────────────────────────────────────────┐
│  Jurnal Baru                                                │
│                                                             │
│  Tanggal        [ 2026-03-25          ]                     │
│  Keterangan     [ Gaji Maret          ]                     │
│                                                             │
│  Baris Jurnal:                                              │
│  ┌──────┬──────────────────────┬────────────┬────────────┐  │
│  │ Tipe │ Akun COA             │ Jumlah     │ Contact    │  │
│  ├──────┼──────────────────────┼────────────┼────────────┤  │
│  │DEBIT │ [5-002 Beban Gaji ▼] │ [5.000.000]│ [Andi    ▼]│  │
│  │CREDIT│ [1-002 Bank       ▼] │ [5.000.000]│ [-       ▼]│  │
│  └──────┴──────────────────────┴────────────┴────────────┘  │
│  [+ Tambah Baris]                                           │
│                                                             │
│  Total Debit : Rp 5.000.000                                 │
│  Total Credit: Rp 5.000.000  ✓ Balance                     │
│                                                             │
│                        [Batal]  [Simpan Jurnal]            │
└─────────────────────────────────────────────────────────────┘
```

---

## 5. Contoh Alur Lengkap: Input Jurnal Manual

```
1. Bayar gaji karyawan via bank transfer
   POST /business/transactions
   → {
       description: "Gaji Maret",
       transactionDate: "2026-03-25",
       lines: [
         { coaId: "<id 5-002>", type: "DEBIT",  amount: 5000000, contactId: "<id Andi>" },
         { coaId: "<id 1-002>", type: "CREDIT", amount: 5000000 }
       ]
     }

2. Bayar sewa kantor tunai
   POST /business/transactions
   → {
       description: "Sewa Kantor April 2026",
       transactionDate: "2026-03-28",
       lines: [
         { coaId: "<id 5-003>", type: "DEBIT",  amount: 3000000 },
         { coaId: "<id 1-001>", type: "CREDIT", amount: 3000000 }
       ]
     }

3. Bayar gaji 2 karyawan sekaligus (compound entry)
   POST /business/transactions
   → {
       description: "Gaji Maret - Andi & Budi",
       transactionDate: "2026-03-25",
       lines: [
         { coaId: "<id 5-002>", type: "DEBIT",  amount: 5000000, contactId: "<id Andi>", description: "Gaji Andi" },
         { coaId: "<id 5-002>", type: "DEBIT",  amount: 3000000, contactId: "<id Budi>", description: "Gaji Budi" },
         { coaId: "<id 1-002>", type: "CREDIT", amount: 8000000, description: "Transfer via BCA" }
       ]
     }

4. Setoran modal tambahan dari pemilik
   POST /business/transactions
   → {
       description: "Tambahan modal Maret 2026",
       transactionDate: "2026-03-30",
       lines: [
         { coaId: "<id 1-002>", type: "DEBIT",  amount: 50000000 },
         { coaId: "<id 3-001>", type: "CREDIT", amount: 50000000 }
       ]
     }

5. Lihat Buku Besar akun Bank (1-002)
   GET /business/transactions?coaId=<id 1-002>&startDate=2026-03-01&endDate=2026-03-31
   → Iterasi entry.lines per entry, cari baris dengan coaId cocok
   → Hitung saldo berjalan dari openingBalance + setiap entry

6. Pembayaran parsial invoice (Rp 3.000.000 dari total Rp 5.550.000)
   POST /business/invoices/:id/pay
   → { paymentCoaId: "<id 1-002>", paymentDate: "2026-03-25", amount: 3000000 }
   ← Server otomatis buat JournalEntry (isSystemGenerated: true):
      Debit  : 1-002 Bank                   Rp 3.000.000
      Credit : 4-001 Pendapatan Penjualan   Rp 3.000.000
   ← Invoice status tetap SENT, amountPaid = 3.000.000, remaining = 2.550.000

7. Pelunasan invoice dengan PPN (sisa Rp 2.550.000)
   POST /business/invoices/:id/pay
   → { paymentCoaId: "<id 1-002>", paymentDate: "2026-03-30" }  ← tanpa amount = bayar sisa
   ← Server otomatis buat JournalEntry (isSystemGenerated: true, 4 baris):
      Debit  : 1-002 Bank                   Rp 2.550.000   (penerimaan sisa)
      Credit : 4-001 Pendapatan Penjualan   Rp 2.550.000
      Debit  : 4-001 Pendapatan Penjualan   Rp   550.000   (reklasifikasi PPN)
      Credit : 2-002 Hutang Pajak PPN       Rp   550.000
   ← Invoice status → PAID
```

---

*End of Document — Phase 4 Frontend API Docs — v2.1 (Tax Auto-Journal + Partial Payment) — 2026-03-21*
