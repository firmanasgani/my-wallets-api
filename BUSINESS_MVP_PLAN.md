# Business MVP - Accounting Lite: Implementation Plan

> Dokumen ini berisi analisis flow dan fitur baru untuk paket Business Plan.
> Semua fitur existing (Personal / Premium) **tidak akan dimodifikasi**.

---

## 1. Paket Subscription Baru

Tambahan kode plan di tabel `SubscriptionPlan` (tidak mengubah struktur existing):

| Plan Code       | Durasi | Keterangan              |
|-----------------|--------|-------------------------|
| `BUSINESS_1M`   | 1 bln  | Business - 1 Bulan      |
| `BUSINESS_6M`   | 6 bln  | Business - 6 Bulan      |
| `BUSINESS_12M`  | 12 bln | Business - 12 Bulan     |

> Existing codes (`FREE`, `PREMIUM_1M`, `PREMIUM_6M`, `PREMIUM_1Y`) tidak berubah.

---

## 2. Arsitektur Layer Baru

Semua fitur Business dikelompokkan dalam module terpisah `business/` sehingga tidak ada coupling ke fitur personal.

```
src/
├── business/
│   ├── company/           ← Company setup & profile
│   ├── members/           ← Multi-user & roles
│   ├── chart-of-accounts/ ← COA auto-generated + custom CRUD + Buku Besar
│   ├── contacts/          ← Rekanan: Customer, Vendor, Employee
│   ├── invoices/          ← Invoice management
│   ├── transactions/      ← Manual BusinessTransaction (double-entry)
│   ├── tax/               ← Tax settings & PPN calculation
│   ├── financial-reports/ ← P&L, Balance Sheet, Cash Flow, Jurnal Umum
│   └── kpi/               ← KPI Dashboard
```

---

## 3. Model Database Baru

### 3.1 `Company`
Profil perusahaan yang dimiliki oleh seorang User (Owner).

```
Company
├── id
├── ownerId         → User.id (Owner)
├── name
├── npwp
├── logoUrl
├── address
├── phone
├── email
├── taxEnabled      Boolean (PPN aktif/tidak)
├── taxRate         Decimal default 11 (%)
├── currency        String default "IDR"
├── createdAt
└── updatedAt
```

### 3.2 `CompanyMember`
Relasi User ke Company dengan role tertentu.

```
CompanyMember
├── id
├── companyId       → Company.id
├── userId          → User.id
├── role            Enum: OWNER | ADMIN | STAFF | VIEWER
├── invitedAt
├── joinedAt
└── status          Enum: PENDING | ACTIVE | REVOKED
```

### 3.3 `ChartOfAccount` (COA)
Auto-generated saat company dibuat. User bisa tambah COA custom (non-system).

```
ChartOfAccount
├── id
├── companyId        → Company.id
├── code             String (e.g. "1-001", "2-001")
├── name             String (e.g. "Kas", "Piutang Usaha")
├── type             Enum: ASSET | LIABILITY | EQUITY | REVENUE | EXPENSE
├── openingBalance   Decimal default 0  ← saldo awal saat company mulai pakai sistem
├── isSystem         Boolean (true = auto-generated, tidak bisa edit/hapus)
├── createdAt
└── updatedAt
```

> COA `isSystem = true` tidak bisa diedit atau dihapus.
> COA custom (isSystem = false) bisa diedit/dihapus selama belum ada `BusinessTransaction` yang mereferensikannya.
> `openingBalance` diisi saat setup awal untuk UMKM yang baru migrasi dari pembukuan manual/Excel.

**Default COA yang di-generate otomatis saat Company dibuat:**

| Code  | Nama                 | Type      |
|-------|----------------------|-----------|
| 1-001 | Kas                  | ASSET     |
| 1-002 | Bank                 | ASSET     |
| 1-003 | Piutang Usaha        | ASSET     |
| 2-001 | Hutang Usaha         | LIABILITY |
| 2-002 | Hutang Pajak (PPN)   | LIABILITY |
| 3-001 | Modal Pemilik        | EQUITY    |
| 3-002 | Laba Ditahan         | EQUITY    |
| 4-001 | Pendapatan Penjualan | REVENUE   |
| 4-002 | Pendapatan Jasa      | REVENUE   |
| 5-001 | Beban Operasional    | EXPENSE   |
| 5-002 | Beban Gaji           | EXPENSE   |
| 5-003 | Beban Sewa           | EXPENSE   |

### 3.4 `Contact`
Pihak eksternal perusahaan (customer, vendor, karyawan) beserta detail rekening bank.

```
Contact
├── id
├── companyId           → Company.id
├── type                Enum: CUSTOMER | VENDOR | EMPLOYEE
├── name
├── email
├── phone
├── bankName
├── bankAccountNumber
├── bankAccountHolder
├── notes
├── createdAt
└── updatedAt
```

> Contact digunakan sebagai referensi pengirim/penerima di `Invoice` dan `BusinessTransaction`.
> Detail rekening bank pihak eksternal disimpan di sini, bukan di COA (COA hanya untuk akun internal perusahaan).

### 3.5 `Invoice`
Manajemen invoice/faktur.

```
Invoice
├── id
├── companyId        → Company.id
├── contactId        → Contact.id (nullable, type: CUSTOMER)
├── invoiceNumber    String unique per company (auto-generated)
├── clientName       String (snapshot dari Contact atau diisi manual)
├── clientEmail      String (snapshot dari Contact atau diisi manual)
├── clientAddress    String (snapshot dari Contact atau diisi manual)
├── issueDate
├── dueDate
├── status           Enum: DRAFT | SENT | PAID | OVERDUE
├── subtotal         Decimal
├── taxAmount        Decimal (dihitung otomatis dari items)
├── totalAmount      Decimal
├── notes
├── createdByUserId  → User.id
├── createdAt
└── updatedAt
```

> Jika `contactId` diset, `clientName/clientEmail/clientAddress` di-populate otomatis dari Contact (sebagai snapshot).
> Snapshot disimpan agar data invoice tidak berubah jika Contact diedit/dihapus di kemudian hari.

### 3.6 `InvoiceItem`
Line item dalam invoice.

```
InvoiceItem
├── id
├── invoiceId      → Invoice.id
├── description
├── quantity       Decimal
├── unitPrice      Decimal
├── taxable        Boolean (kena PPN atau tidak)
├── taxRate        Decimal (snapshot dari Company.taxRate)
├── taxAmount      Decimal (computed)
└── total          Decimal (computed)
```

### 3.7 `BusinessTransaction`
Double-entry transaction ke COA untuk keperluan laporan keuangan.
Tidak menggantikan `Transaction` existing — ini layer akuntansi terpisah.

```
BusinessTransaction
├── id
├── companyId          → Company.id
├── debitCoaId         → ChartOfAccount.id  (akun yang di-debit)
├── creditCoaId        → ChartOfAccount.id  (akun yang di-kredit)
├── contactId          → Contact.id (nullable, pengirim/penerima eksternal)
├── invoiceId          → Invoice.id (nullable, jika berasal dari invoice)
├── amount             Decimal
├── description        String (keterangan, misal "Gaji Maret - Andi")
├── transactionDate
├── createdByUserId    → User.id
└── createdAt
```

> Kedua sisi double-entry (`debitCoaId` dan `creditCoaId`) selalu merujuk ke COA internal perusahaan.
> Pihak eksternal (rekening pengirim/penerima) dicatat via `contactId` — bukan sebagai COA.

---

## 4. Flow yang Ditambah

### 4.1 Company Onboarding Flow

```
User (Business Subscriber)
    │
    ▼
POST /business/company
    ├── Validasi user punya active BUSINESS subscription
    ├── Buat record Company
    ├── Set user sebagai CompanyMember (role: OWNER)
    └── Auto-generate default Chart of Accounts (12 COA)
```

### 4.2 Multi-User & Role Management Flow

```
Owner / Admin
    │
    ▼
POST /business/members/invite
    ├── Kirim email undangan ke user lain
    ├── Create CompanyMember (status: PENDING)
    └── User menerima → status: ACTIVE

GET  /business/members              → list semua member
PUT  /business/members/:id/role     → ubah role
DELETE /business/members/:id        → revoke akses

Role Permissions:
├── OWNER  → full access + hapus company
├── ADMIN  → full access kecuali hapus company
├── STAFF  → buat invoice, input transaksi
└── VIEWER → read-only
```

### 4.3 Invoice Lifecycle Flow

```
DRAFT ──► SENT ──► PAID
  │
  └──────────────► OVERDUE (cron job check dueDate)

POST   /business/invoices           → buat invoice (DRAFT)
                                      jika contactId diset → snapshot client info dari Contact
PUT    /business/invoices/:id       → edit invoice (hanya saat DRAFT)
POST   /business/invoices/:id/send  → ubah status → SENT
POST   /business/invoices/:id/pay   → ubah status → PAID
                                      body: { paymentCoaId, paymentDate }
                                      + otomatis buat BusinessTransaction:
                                        debit:  paymentCoaId (COA Bank/Kas yang dipilih user)
                                        credit: 4-001 Pendapatan Penjualan
                                        contactId: Invoice.contactId
DELETE /business/invoices/:id       → soft delete (hanya DRAFT)
```

**Auto-numbering Invoice:**
Format: `INV-{YYYY}-{MM}-{sequence}` — contoh: `INV-2026-03-0001`

### 4.4 PPN Tax Calculation Flow

```
Invoice Creation
    │
    ▼
Foreach InvoiceItem:
    if (item.taxable && company.taxEnabled):
        item.taxAmount = item.unitPrice * item.quantity * (taxRate / 100)

Invoice totals:
    subtotal    = sum(item.unitPrice * item.quantity)
    taxAmount   = sum(item.taxAmount)
    totalAmount = subtotal + taxAmount

Saat Invoice PAID:
    if taxAmount > 0:
        Buat BusinessTransaction:
            debit:  2-002 (Hutang Pajak PPN) — sebagai kewajiban yang timbul
```

### 4.5 Financial Reports Flow

Semua laporan di-generate **dari `BusinessTransaction` + `openingBalance` COA** — bukan dari personal `Transaction`.

#### P&L (Profit & Loss)
```
GET /business/reports/profit-loss?startDate=&endDate=

Revenue    = sum(BusinessTransaction WHERE creditCoaId → coa.type = REVENUE)
Expense    = sum(BusinessTransaction WHERE debitCoaId  → coa.type = EXPENSE)
Net Profit = Revenue - Expense
```

#### Balance Sheet
```
GET /business/reports/balance-sheet?date=

Saldo per COA = openingBalance + sum(DEBIT movements) - sum(CREDIT movements)
  (untuk ASSET & EXPENSE: normal balance = DEBIT)
  (untuk LIABILITY, EQUITY, REVENUE: normal balance = CREDIT)

Assets      = sum(saldo COA type ASSET)
Liabilities = sum(saldo COA type LIABILITY)
Equity      = sum(saldo COA type EQUITY) + Net Profit s/d tanggal tersebut
              Assets = Liabilities + Equity ✓
```

#### Cash Flow (Simplified)
```
GET /business/reports/cash-flow?startDate=&endDate=

Operating Cash Flow:
  + Penerimaan dari pelanggan (Invoice PAID → debit COA type ASSET/Kas/Bank)
  - Pembayaran beban operasional (debit COA type EXPENSE)

Opening Cash = openingBalance COA Kas + COA Bank
Ending Cash  = Opening Cash + Net Cash Flow
```

#### Jurnal Umum (General Journal)
```
GET /business/reports/journal?startDate=&endDate=

Menampilkan semua BusinessTransaction dalam format jurnal kronologis.

Response per entry:
├── date
├── description
├── reference       (invoiceNumber jika berasal dari invoice)
├── contact         (nama Contact jika ada)
├── debit  { code, name, amount }
└── credit { code, name, amount }
```

### 4.6 KPI Dashboard Flow

```
GET /business/kpi

Response:
├── totalRevenue        (bulan ini)
├── totalExpense        (bulan ini)
├── netProfit           (bulan ini)
├── totalReceivable     (Invoice status SENT/OVERDUE)
├── overdueInvoices     (count + total amount)
├── revenueGrowth       (% vs bulan lalu)
├── topRevenueAccounts  (COA revenue terbesar)
└── cashPosition        (saldo COA Cash + Bank)
```

### 4.7 Audit Log (Business Context)

Extend `LogActionType` enum (tambah, tidak ubah existing):

```
BUSINESS_COMPANY_CREATE
BUSINESS_COMPANY_UPDATE
BUSINESS_MEMBER_INVITE
BUSINESS_MEMBER_ROLE_UPDATE
BUSINESS_MEMBER_REVOKE
BUSINESS_INVOICE_CREATE
BUSINESS_INVOICE_SENT
BUSINESS_INVOICE_PAID
BUSINESS_INVOICE_OVERDUE
BUSINESS_REPORT_EXPORT
```

---

## 5. Guard & Middleware Baru

### 5.1 `BusinessSubscriptionGuard`
Cek apakah user punya active `BUSINESS_*` subscription. Dipakai di semua route `/business/*`.

### 5.2 `CompanyMemberGuard`
Cek apakah user adalah member aktif dari company yang di-request.

### 5.3 `CompanyRoleGuard`
Cek role minimum yang diperlukan (e.g. `@RequireRole('ADMIN')`).

---

## 6. Cron Jobs Baru

| Job | Schedule | Fungsi |
|-----|----------|--------|
| `InvoiceOverdueCron` | Setiap hari jam 00:00 | Ubah Invoice status ke OVERDUE jika `dueDate < today && status = SENT` |

---

## 7. Yang TIDAK Diubah / Disentuh

| Fitur Existing | Status |
|----------------|--------|
| Personal Accounts, Transactions, Categories | ✅ Tidak diubah |
| Budgets & Financial Goals | ✅ Tidak diubah |
| Premium Subscription & Midtrans flow | ✅ Tidak diubah |
| Auth (login, register, forgot password) | ✅ Tidak diubah |
| Recurring Transactions | ✅ Tidak diubah |
| Existing Reports module | ✅ Tidak diubah |
| Existing Log model | ✅ Hanya extend enum, tidak ubah tabel |

---

## 8. Ringkasan Module & Endpoint Baru

```
/business/company
    POST   /                    → buat company (onboarding)
    GET    /                    → get company detail
    PUT    /                    → update company profile

/business/members
    GET    /                    → list members
    POST   /invite              → invite member via email
    PUT    /:id/role            → update role
    DELETE /:id                 → revoke member

/business/chart-of-accounts
    GET    /                    → list semua COA
    POST   /                    → tambah COA custom (non-system)
    PUT    /:id                 → edit COA (non-system only) + set openingBalance
    DELETE /:id                 → hapus COA (non-system, belum ada transaksi)
    GET    /:id/ledger          → Buku Besar per COA
                                  query: ?startDate=&endDate=
                                  response: { openingBalance, entries: [{ date, description, debit, credit, balance }], closingBalance }

/business/contacts
    GET    /                    → list contacts (filter by type: CUSTOMER|VENDOR|EMPLOYEE)
    POST   /                    → tambah contact baru
    GET    /:id                 → detail contact
    PUT    /:id                 → edit contact
    DELETE /:id                 → hapus contact

/business/invoices
    GET    /                    → list invoices (filter by status)
    POST   /                    → buat invoice baru (DRAFT)
    GET    /:id                 → detail invoice
    PUT    /:id                 → edit invoice (DRAFT only)
    DELETE /:id                 → hapus invoice (DRAFT only)
    POST   /:id/send            → kirim invoice → status SENT
    POST   /:id/pay             → tandai lunas → status PAID (body: paymentCoaId, paymentDate)

/business/transactions
    GET    /                    → list business transactions
    POST   /                    → input transaksi manual (expense, beban, dll)
                                  body: { debitCoaId, creditCoaId, contactId?, amount, description, transactionDate }
    DELETE /:id                 → hapus transaksi (bukan dari invoice)

/business/reports
    GET    /profit-loss         → Laporan Laba Rugi
    GET    /balance-sheet       → Neraca Keuangan
    GET    /cash-flow           → Arus Kas
    GET    /journal             → Jurnal Umum (semua entry kronologis)

/business/kpi
    GET    /                    → KPI Dashboard summary
```

---

## 9. Urutan Implementasi (Prioritas)

| Fase | Scope | Keterangan |
|------|-------|------------|
| **1** | Subscription Plans + Company Setup + COA | Fondasi: buat company & auto-generate COA |
| **2** | Multi-user & Role Management | Invite & manage team |
| **3** | Contact CRUD + COA CRUD (+ openingBalance) + Invoice Management | Contact sebagai rekanan, COA custom + saldo awal, invoice lifecycle |
| **4** | BusinessTransaction (double-entry) + Manual Transaction + Tax | Double-entry ke COA, input manual expense, PPN |
| **5** | Financial Reports (P&L, Balance Sheet, Cash Flow, Jurnal Umum) + Buku Besar per COA | Generate dari BusinessTransaction + openingBalance |
| **6** | KPI Dashboard | Agregasi data dari laporan |
| **7** | Audit Log extension + Cron Overdue | Finalisasi & polish |
| **8** | PPh Config + Asset Management (PSAK 16/19) + Transaction Attachment + KPI Enhancement + Checker/Approver Workflow | Advanced accounting features |

---

## 10. Phase 8 — Advanced Accounting Features

> Semua fitur Phase 8 bersifat **additive** — tidak mengubah model atau logic yang sudah ada di Phase 1–7.

---

### 10.1 Konfigurasi Pajak PPh (Witholding Tax)

Extend modul `business/tax/` untuk mendukung konfigurasi multi-jenis PPh di samping PPN yang sudah ada.

#### Model Baru: `TaxConfig`

```
TaxConfig
├── id
├── companyId     → Company.id
├── type          Enum: PPN | PPH_21 | PPH_22 | PPH_23 | PPH_4_2 | PPH_15
├── name          String  (label deskriptif, e.g. "PPh 23 - Jasa")
├── rate          Decimal (persentase, e.g. 2.00)
├── isActive      Boolean default true
├── description   String? (opsional, catatan penggunaan)
├── createdAt
└── updatedAt
```

**Jenis PPh yang didukung:**

| Enum         | Pasal    | Objek Pajak Umum                                       | Tarif Default |
|--------------|----------|--------------------------------------------------------|---------------|
| `PPH_21`     | Pasal 21 | Penghasilan karyawan/individu (gaji, honorarium)        | 5% – 35% (progresif) |
| `PPH_22`     | Pasal 22 | Impor barang, pembelian dari badan tertentu             | 1.5% – 7.5%  |
| `PPH_23`     | Pasal 23 | Dividen, bunga, royalti, jasa domestik                  | 2% (jasa), 15% (dividen/bunga) |
| `PPH_4_2`    | Pasal 4(2) | Sewa tanah/bangunan, jasa konstruksi, bunga deposito  | 2.5% – 20%   |
| `PPH_15`     | Pasal 15 | Pelayaran, penerbangan, perusahaan asing tertentu       | 1.2% – 2.64% |
| `PPN`        | UU PPN   | Pajak Pertambahan Nilai (sudah ada di Phase 4)          | 11%          |

> `TaxConfig` bersifat per-company. Setiap company bisa mendefinisikan multiple TaxConfig dengan tipe berbeda.
> Satu tipe pajak bisa punya beberapa config (misal: PPH_23 untuk jasa 2% dan untuk dividen 15%).

**Penggunaan TaxConfig pada BusinessTransaction:**

Extend `BusinessTransaction` dengan field opsional:
```
BusinessTransaction
├── ... (existing fields)
├── taxConfigId   → TaxConfig.id (nullable)  ← pajak yang dipotong
└── taxAmount     Decimal default 0           ← jumlah pajak yang dipotong
```

Saat transaksi dibuat dengan `taxConfigId`:
```
taxAmount = amount × (taxConfig.rate / 100)
netAmount = amount - taxAmount

Jurnal otomatis tambahan:
  debit:  COA Hutang Pajak (tipe PPh terkait)
  credit: COA yang di-kredit (dari normal jurnal)
```

**Endpoints baru:**

```
/business/tax
    GET    /                → list semua TaxConfig milik company
    POST   /                → tambah TaxConfig baru
    PUT    /:id             → update TaxConfig
    DELETE /:id             → hapus TaxConfig (jika belum dipakai di transaksi)
```

**COA tambahan di default generate saat Company dibuat:**

| Code  | Nama                        | Type      |
|-------|-----------------------------|-----------|
| 2-003 | Hutang PPh 21               | LIABILITY |
| 2-004 | Hutang PPh 22               | LIABILITY |
| 2-005 | Hutang PPh 23               | LIABILITY |
| 2-006 | Hutang PPh Pasal 4 Ayat 2   | LIABILITY |
| 2-007 | Hutang PPh 15               | LIABILITY |

---

### 10.2 Manajemen Aset & Penyusutan/Amortisasi (PSAK 16 & PSAK 19)

> **Referensi standar:**
> - Aset Berwujud (PP&E): **PSAK 16** — Aset Tetap
> - Aset Tidak Berwujud: **PSAK 19** — Aset Tak Berwujud
> Kedua standar mengadopsi prinsip dasar IAS 16 & IAS 38.

Modul baru: `src/business/assets/`

#### Model Baru: `Asset`

```
Asset
├── id
├── companyId              → Company.id
├── assetCoaId             → ChartOfAccount.id  (COA nilai perolehan aset)
├── accumulatedCoaId       → ChartOfAccount.id  (COA akumulasi penyusutan/amortisasi)
├── depreciationExpenseCoaId → ChartOfAccount.id (COA beban penyusutan/amortisasi)
├── assetType              Enum: TANGIBLE | INTANGIBLE
├── name                   String (nama aset, e.g. "Kendaraan Operasional - Toyota Avanza")
├── code                   String (kode aset, e.g. "FA-001")
├── acquisitionDate        Date
├── acquisitionCost        Decimal  (harga perolehan)
├── residualValue          Decimal  default 0  (nilai sisa / salvage value)
├── usefulLifeMonths       Int      (masa manfaat dalam bulan, sesuai PSAK)
├── depreciationMethod     Enum: STRAIGHT_LINE | DECLINING_BALANCE | DOUBLE_DECLINING | UNITS_OF_PRODUCTION
├── unitsTotal             Decimal? (wajib jika method = UNITS_OF_PRODUCTION, total estimasi unit produksi)
├── status                 Enum: ACTIVE | DISPOSED | FULLY_DEPRECIATED
├── disposalDate           Date?
├── disposalAmount         Decimal?   (hasil penjualan aset saat disposal)
├── disposalCoaId          → ChartOfAccount.id? (COA penerimaan dari penjualan aset)
├── notes                  String?
├── createdAt
└── updatedAt
```

#### Model Baru: `AssetDepreciation`

Catatan penyusutan/amortisasi per periode bulanan.

```
AssetDepreciation
├── id
├── assetId                → Asset.id
├── companyId              → Company.id
├── periodYear             Int   (tahun, e.g. 2026)
├── periodMonth            Int   (bulan 1–12)
├── depreciationAmount     Decimal  (jumlah penyusutan periode ini)
├── accumulatedDepreciation Decimal (total akumulasi s/d periode ini)
├── bookValue              Decimal  (nilai buku setelah penyusutan periode ini)
├── unitsProduced          Decimal? (diisi jika method = UNITS_OF_PRODUCTION)
├── businessTxId           → BusinessTransaction.id  (jurnal yang auto-dibuat)
├── createdAt
└── updatedAt
```

#### Metode Perhitungan Penyusutan/Amortisasi

**1. Garis Lurus (Straight-Line) — PSAK 16 par. 62**
```
Penyusutan per Bulan = (Harga Perolehan - Nilai Sisa) / Masa Manfaat (bulan)
```
Berlaku sama setiap bulan sepanjang masa manfaat.

**2. Saldo Menurun (Declining Balance) — PSAK 16 par. 62**
```
Tarif Tahunan = 1 - (Nilai Sisa / Harga Perolehan)^(1/n)  [n = masa manfaat dalam tahun]
Penyusutan per Bulan = Nilai Buku Awal Bulan × (Tarif Tahunan / 12)
```
Penyusutan lebih besar di awal masa manfaat, menurun setiap periode.

**3. Saldo Menurun Ganda (Double Declining Balance)**
```
Tarif = (2 / Masa Manfaat dalam tahun)
Penyusutan per Bulan = Nilai Buku Awal Bulan × (Tarif / 12)
Pada periode terakhir: disesuaikan agar nilai buku = nilai sisa
```

**4. Unit Produksi (Units of Production) — PSAK 16 par. 62**
```
Penyusutan per Unit = (Harga Perolehan - Nilai Sisa) / Total Unit Estimasi
Penyusutan Bulan Ini = Unit Diproduksi Bulan Ini × Penyusutan per Unit
```
Memerlukan input `unitsProduced` manual setiap bulan.

#### Auto-Jurnal Penyusutan

Setiap kali penyusutan dijalankan (manual atau cron), sistem otomatis membuat `BusinessTransaction`:

```
Debit:  depreciationExpenseCoaId  (Beban Penyusutan / Beban Amortisasi)
Credit: accumulatedCoaId          (Akumulasi Penyusutan / Akumulasi Amortisasi)
Amount: depreciationAmount
Description: "Penyusutan {nama aset} - {Bulan/Tahun}"
Status: APPROVED (auto-approve, tidak perlu checker/approver)
```

#### Auto-Jurnal Disposal Aset

Saat aset di-dispose:

```
JIKA disposalAmount > bookValue (untung):
  Debit:  disposalCoaId (Kas/Bank — penerimaan)
  Debit:  accumulatedCoaId (Akumulasi Penyusutan — hapus akumulasi)
  Credit: assetCoaId (hapus nilai perolehan aset)
  Credit: COA Laba Pelepasan Aset (non-operating revenue)

JIKA disposalAmount < bookValue (rugi):
  Debit:  disposalCoaId (Kas/Bank — penerimaan)
  Debit:  accumulatedCoaId (Akumulasi Penyusutan — hapus akumulasi)
  Debit:  COA Rugi Pelepasan Aset (non-operating expense)
  Credit: assetCoaId (hapus nilai perolehan aset)
```

#### COA Tambahan Default untuk Aset

| Code  | Nama                                      | Type      |
|-------|-------------------------------------------|-----------|
| 1-004 | Aset Tetap                                | ASSET     |
| 1-005 | Akumulasi Penyusutan Aset Tetap           | ASSET     |
| 1-006 | Aset Tidak Berwujud                       | ASSET     |
| 1-007 | Akumulasi Amortisasi Aset Tidak Berwujud  | ASSET     |
| 5-004 | Beban Penyusutan Aset Tetap               | EXPENSE   |
| 5-005 | Beban Amortisasi Aset Tidak Berwujud      | EXPENSE   |
| 5-006 | Harga Pokok Penjualan (HPP)               | EXPENSE   |
| 6-001 | Pendapatan Luar Usaha                     | REVENUE   |
| 6-002 | Laba Pelepasan Aset                       | REVENUE   |
| 7-001 | Beban Luar Usaha                          | EXPENSE   |
| 7-002 | Rugi Pelepasan Aset                       | EXPENSE   |

> COA kode 6-xxx = Non-operating Revenue, 7-xxx = Non-operating Expense — pembagian ini dipakai untuk KPI.

#### Endpoints Aset

```
/business/assets
    GET    /                    → list aset (filter: type, status)
    POST   /                    → tambah aset baru
    GET    /:id                 → detail aset + ringkasan penyusutan
    PUT    /:id                 → edit aset (hanya jika belum ada AssetDepreciation)
    DELETE /:id                 → hapus aset (hanya jika belum ada jurnal)
    POST   /:id/dispose         → catat pelepasan aset (otomatis buat jurnal)
    GET    /:id/schedule        → lihat jadwal penyusutan seluruh masa manfaat
    GET    /:id/depreciations   → riwayat jurnal penyusutan yang sudah dijalankan

/business/assets/run-depreciation
    POST   /                    → jalankan penyusutan manual untuk periode tertentu
                                  body: { year, month, assetIds?: string[] }
                                  → semua ACTIVE assets (atau subset) untuk periode tsb
```

#### Cron Baru: `AssetDepreciationCron`

```
Schedule: Setiap tanggal 1 jam 01:00 (0 1 1 * *)
Fungsi:
    foreach Company (BUSINESS subscription aktif):
        foreach Asset (status: ACTIVE, method != UNITS_OF_PRODUCTION):
            hitung depreciationAmount untuk bulan berjalan
            buat AssetDepreciation record
            buat BusinessTransaction (auto-approved)
            if (accumulatedDepreciation >= acquisitionCost - residualValue):
                update Asset.status = FULLY_DEPRECATED
```

> Aset dengan method `UNITS_OF_PRODUCTION` tidak di-auto-run karena butuh input unit produksi per bulan.

---

### 10.3 Attachment pada Transaksi Manual

Extend `BusinessTransaction` untuk mendukung upload bukti transaksi (PDF atau gambar).

#### Model Baru: `TransactionAttachment`

```
TransactionAttachment
├── id
├── businessTransactionId  → BusinessTransaction.id
├── companyId              → Company.id
├── fileUrl                String  (URL storage, e.g. S3/GCS/local)
├── fileName               String  (nama file asli)
├── mimeType               String  (e.g. "application/pdf", "image/jpeg", "image/png")
├── fileSize               Int     (bytes)
├── uploadedByUserId       → User.id
├── createdAt
└── updatedAt
```

**File types yang diterima:** `application/pdf`, `image/jpeg`, `image/png`, `image/webp`
**Batas ukuran:** 10 MB per file, maksimum 5 attachment per transaksi.

**Endpoints:**

```
/business/transactions/:id/attachments
    GET    /                         → list attachment pada transaksi
    POST   /                         → upload attachment (multipart/form-data)
    DELETE /:attachmentId            → hapus attachment
```

> Upload hanya diperbolehkan jika transaksi status bukan `APPROVED` (kecuali OWNER/ADMIN).
> File disimpan di storage layer (implementasi storage provider diserahkan ke layer infrastruktur).

---

### 10.4 Checker & Approver Workflow pada Transaksi Manual

Tambahkan approval workflow opsional untuk transaksi manual. Workflow ini dapat diaktifkan/dinonaktifkan per company.

#### Perubahan pada Model `Company`

```
Company
├── ... (existing fields)
└── requiresApprovalWorkflow  Boolean default false
```

Jika `requiresApprovalWorkflow = false`, semua transaksi manual langsung berstatus `APPROVED`.

#### Perubahan pada `CompanyMember` — Role Enum

Tambah role `CHECKER`:

```
Role: OWNER | ADMIN | CHECKER | STAFF | VIEWER
```

| Role    | Create Tx | Submit | Check | Approve | Full Access |
|---------|-----------|--------|-------|---------|-------------|
| OWNER   | ✓         | ✓      | ✓     | ✓       | ✓           |
| ADMIN   | ✓         | ✓      | ✓     | ✓       | ✓           |
| CHECKER | ✓         | ✓      | ✓     | ✗       | ✗           |
| STAFF   | ✓         | ✓      | ✗     | ✗       | ✗           |
| VIEWER  | ✗         | ✗      | ✗     | ✗       | read-only   |

#### Perubahan pada Model `BusinessTransaction`

```
BusinessTransaction
├── ... (existing fields)
├── status             Enum: DRAFT | PENDING_CHECK | PENDING_APPROVAL | APPROVED | REJECTED
                       default: APPROVED (jika requiresApprovalWorkflow = false)
                                DRAFT    (jika requiresApprovalWorkflow = true)
├── checkerUserId      → User.id? (user yang melakukan pengecekan)
├── approverUserId     → User.id? (user yang melakukan approval)
├── checkedAt          DateTime?
├── approvedAt         DateTime?
├── rejectedAt         DateTime?
└── rejectionNote      String?  (catatan penolakan)
```

#### Alur Status Transaksi Manual

```
requiresApprovalWorkflow = false:
  POST /transactions → langsung APPROVED

requiresApprovalWorkflow = true:
  POST /transactions → DRAFT
       │
  POST /:id/submit  → PENDING_CHECK   (oleh STAFF/CHECKER/ADMIN/OWNER)
       │
  POST /:id/check   → PENDING_APPROVAL (oleh CHECKER/ADMIN/OWNER)
       │
  POST /:id/approve → APPROVED         (oleh ADMIN/OWNER)
       │
  POST /:id/reject  → REJECTED         (oleh CHECKER/ADMIN/OWNER, di tahap check atau approval)
       │
  [REJECTED] dapat di-edit lalu submit ulang → kembali ke PENDING_CHECK
```

> Hanya transaksi berstatus `APPROVED` yang dihitung dalam laporan keuangan (P&L, Balance Sheet, Cash Flow, Jurnal Umum, Buku Besar).
> Transaksi dari Invoice (pay) dan penyusutan aset (auto-journal) langsung berstatus `APPROVED`.

**Endpoints tambahan pada `/business/transactions`:**

```
POST   /                    → buat transaksi (status tergantung requiresApprovalWorkflow)
PUT    /:id                 → edit transaksi (hanya DRAFT atau REJECTED)
POST   /:id/submit          → submit ke checker (DRAFT → PENDING_CHECK)
POST   /:id/check           → checker setuju (PENDING_CHECK → PENDING_APPROVAL)
POST   /:id/approve         → approver setuju (PENDING_APPROVAL → APPROVED)
POST   /:id/reject          → tolak transaksi, body: { note: string }
                              (dari PENDING_CHECK atau PENDING_APPROVAL → REJECTED)
```

---

### 10.5 KPI Dashboard — Enhancement P&L Detail

Untuk mendukung KPI yang lebih granular, tambahkan field `subType` pada `ChartOfAccount`:

#### Perubahan pada Model `ChartOfAccount`

```
ChartOfAccount
├── ... (existing fields)
└── subType  Enum: OPERATING | NON_OPERATING | COGS | null
             default: null
```

**Mapping subType untuk default COA:**

| Code  | Type    | subType       | Keterangan                          |
|-------|---------|---------------|-------------------------------------|
| 4-001 | REVENUE | OPERATING     | Pendapatan Penjualan                |
| 4-002 | REVENUE | OPERATING     | Pendapatan Jasa                     |
| 5-001 | EXPENSE | OPERATING     | Beban Operasional                   |
| 5-002 | EXPENSE | OPERATING     | Beban Gaji                          |
| 5-003 | EXPENSE | OPERATING     | Beban Sewa                          |
| 5-006 | EXPENSE | COGS          | Harga Pokok Penjualan               |
| 6-001 | REVENUE | NON_OPERATING | Pendapatan Luar Usaha               |
| 6-002 | REVENUE | NON_OPERATING | Laba Pelepasan Aset                 |
| 7-001 | EXPENSE | NON_OPERATING | Beban Luar Usaha                    |
| 7-002 | EXPENSE | NON_OPERATING | Rugi Pelepasan Aset                 |

#### KPI Dashboard Response — Tambahan

```
GET /business/kpi

Response (tambahan di samping field existing):

P&L Summary (bulan berjalan):
├── operatingRevenue        sum(APPROVED tx → credit COA: type=REVENUE, subType=OPERATING)
├── costOfGoodsSold         sum(APPROVED tx → debit  COA: type=EXPENSE, subType=COGS)
├── grossProfit             operatingRevenue - costOfGoodsSold
├── operatingExpenses       sum(APPROVED tx → debit  COA: type=EXPENSE, subType=OPERATING)
├── nonOperatingIncome      sum(APPROVED tx → credit COA: type=REVENUE, subType=NON_OPERATING)
├── nonOperatingExpenses    sum(APPROVED tx → debit  COA: type=EXPENSE, subType=NON_OPERATING)
└── netProfit               grossProfit - operatingExpenses + nonOperatingIncome - nonOperatingExpenses

Formula:
  Laba Kotor  = Pendapatan Usaha  - HPP
  Laba Bersih = Laba Kotor - Beban Usaha + Penghasilan Luar Usaha - Beban Luar Usaha
```

> Field existing (`totalRevenue`, `totalExpense`, `netProfit` lama) tetap dipertahankan untuk backward compatibility.
> `netProfit` lama = `totalRevenue - totalExpense` (gross), sedangkan `netProfit` baru di P&L Summary lebih akurat.

---

### 10.6 Ringkasan Perubahan Model (Phase 8)

#### Model Baru
| Model                   | Modul              | Keterangan                            |
|-------------------------|--------------------|---------------------------------------|
| `TaxConfig`             | `business/tax/`    | Konfigurasi PPh per company           |
| `Asset`                 | `business/assets/` | Register aset tetap & tidak berwujud  |
| `AssetDepreciation`     | `business/assets/` | Jurnal penyusutan/amortisasi per bulan |
| `TransactionAttachment` | `business/transactions/` | Lampiran bukti transaksi         |

#### Model yang Di-extend
| Model                 | Perubahan                                                         |
|-----------------------|-------------------------------------------------------------------|
| `Company`             | + `requiresApprovalWorkflow` Boolean                             |
| `ChartOfAccount`      | + `subType` Enum (OPERATING \| NON_OPERATING \| COGS \| null)    |
| `BusinessTransaction` | + `status`, `checkerUserId`, `approverUserId`, `checkedAt`, `approvedAt`, `rejectedAt`, `rejectionNote`, `taxConfigId`, `taxAmount` |
| `CompanyMember` role  | + `CHECKER` di enum role                                         |

#### COA Default Tambahan (total +16 dari yang sudah ada 12)
Saat Company dibuat, generate 16 COA tambahan (kode 1-004 s/d 7-002) sesuai tabel di 10.2.

#### Cron Baru
| Job                     | Schedule       | Fungsi                                          |
|-------------------------|----------------|-------------------------------------------------|
| `AssetDepreciationCron` | `0 1 1 * *`    | Auto-penyusutan aset (method selain UoP), awal bulan |

#### Endpoint Summary Baru
```
/business/tax
    GET  /             → list TaxConfig
    POST /             → buat TaxConfig
    PUT  /:id          → update TaxConfig
    DELETE /:id        → hapus TaxConfig

/business/assets
    GET  /             → list aset
    POST /             → tambah aset
    GET  /:id          → detail + ringkasan penyusutan
    PUT  /:id          → edit aset
    DELETE /:id        → hapus aset
    POST /:id/dispose  → lepas/jual aset (auto-jurnal)
    GET  /:id/schedule → jadwal penyusutan (projection)
    GET  /:id/depreciations → riwayat jurnal penyusutan

/business/assets/run-depreciation
    POST /             → jalankan penyusutan manual (body: { year, month, assetIds? })

/business/transactions/:id/attachments
    GET  /             → list attachment
    POST /             → upload attachment
    DELETE /:attachmentId → hapus attachment

/business/transactions (endpoint tambahan)
    POST /:id/submit   → submit ke checker
    POST /:id/check    → checker setuju
    POST /:id/approve  → approver setuju
    POST /:id/reject   → tolak transaksi
```

#### Audit Log Tambahan (Phase 8)
```
BUSINESS_ASSET_CREATE
BUSINESS_ASSET_DEPRECIATION_RUN
BUSINESS_ASSET_DISPOSED
BUSINESS_TX_SUBMITTED
BUSINESS_TX_CHECKED
BUSINESS_TX_APPROVED
BUSINESS_TX_REJECTED
BUSINESS_TAX_CONFIG_CREATE
BUSINESS_TAX_CONFIG_UPDATE
```

---

### 10.7 Tax Suggestion Engine

Sistem **rule-based** yang menganalisis konteks transaksi (COA dipilih, tipe contact, deskripsi) dan mengembalikan daftar PPh yang *disarankan* beserta alasannya. Bersifat **non-binding** — user tetap bebas memilih atau mengabaikan saran.

#### Cara Kerja

```
Frontend mengirim konteks transaksi saat user sedang mengisi form:
  → debitCoaId, creditCoaId, contactId, amount, description

Backend menjalankan rule engine:
  → cocokkan konteks dengan setiap SuggestionRule
  → kembalikan list TaxConfig yang match + penjelasan kenapa
```

#### Trigger Rules per Jenis PPh

| PPh       | Trigger Otomatis                                                                 | Catatan                                        |
|-----------|----------------------------------------------------------------------------------|------------------------------------------------|
| **PPh 21** | COA debit = Beban Gaji (`5-002`) **atau** keyword di description: `gaji`, `honorarium`, `upah`, `THR`, `bonus` **atau** Contact type = `EMPLOYEE` | Tarif progresif; saran tampilkan tarif 5% sebagai default |
| **PPh 22** | COA debit = akun pembelian barang **dan** Contact type = `VENDOR` **dan** keyword: `impor`, `pengadaan`, `BUMN` | Umumnya dipotong oleh bendahara/pemungut |
| **PPh 23** | COA debit = EXPENSE **dan** Contact type = `VENDOR` (bukan perorangan) **dan** keyword: `jasa`, `konsultan`, `sewa` (bukan tanah/bangunan), `royalti`, `dividen`, `bunga` | Default 2% untuk jasa; 15% untuk dividen/bunga/royalti |
| **PPh 4(2)** | COA debit = Beban Sewa (`5-003`) **dan** keyword: `sewa tanah`, `sewa gedung`, `sewa bangunan`, `kost`, `ruko` **atau** COA debit = akun jasa konstruksi | Final tax; tidak dapat dikreditkan |
| **PPh 15** | Contact type = `VENDOR` **dan** keyword: `pelayaran`, `pengiriman laut`, `charter`, `penerbangan` | Spesifik industri transportasi |

#### Model: `TaxSuggestionRule` (Opsional — jika company ingin custom rules)

Selain rules bawaan sistem, company bisa mendefinisikan rule custom:

```
TaxSuggestionRule
├── id
├── companyId         → Company.id
├── taxConfigId       → TaxConfig.id  (PPh yang disarankan jika rule match)
├── triggerCoaIds     String[]  (cocok jika debitCoaId atau creditCoaId ada di list ini)
├── triggerContactType Enum: CUSTOMER | VENDOR | EMPLOYEE | null  (null = semua tipe)
├── triggerKeywords   String[]  (cocok jika description mengandung salah satu keyword)
├── minAmount         Decimal?  (saran hanya muncul jika amount >= minAmount)
├── priority          Int default 0  (urutan tampil di saran, lebih tinggi = lebih atas)
├── note              String?   (penjelasan yang ditampilkan ke user)
├── isActive          Boolean default true
├── createdAt
└── updatedAt
```

> System rules (bawaan) tidak disimpan di database — hardcoded di service layer.
> Custom rules per-company disimpan di `TaxSuggestionRule` dan di-merge dengan system rules saat evaluasi.

#### Suggestion Response Format

```json
POST /business/transactions/suggest-tax
Body: {
  "debitCoaId": "coa-uuid-beban-gaji",
  "creditCoaId": "coa-uuid-bank",
  "contactId": "contact-uuid-karyawan",
  "amount": 5000000,
  "description": "Pembayaran honorarium desainer freelance Maret"
}

Response:
{
  "suggestions": [
    {
      "taxConfigId": "taxconfig-uuid-pph21",
      "type": "PPH_21",
      "name": "PPh 21 - Honorarium",
      "rate": 5.00,
      "taxAmount": 250000,
      "netAmount": 4750000,
      "confidence": "HIGH",
      "reason": "Pembayaran ke individu (Contact tipe EMPLOYEE) dengan kata kunci 'honorarium' — dikenakan PPh Pasal 21.",
      "source": "SYSTEM_RULE"
    },
    {
      "taxConfigId": "taxconfig-uuid-pph23",
      "type": "PPH_23",
      "name": "PPh 23 - Jasa",
      "rate": 2.00,
      "taxAmount": 100000,
      "netAmount": 4900000,
      "confidence": "MEDIUM",
      "reason": "Kata kunci 'desainer' dan 'freelance' cocok dengan kategori jasa — pertimbangkan PPh 23 jika penerima adalah badan usaha.",
      "source": "SYSTEM_RULE"
    }
  ],
  "notes": "PPh 21 berlaku jika penerima adalah orang pribadi. PPh 23 berlaku jika penerima adalah badan usaha. Pastikan status penerima sebelum memilih."
}
```

**Field `confidence`:**
| Level    | Kondisi                                                         |
|----------|-----------------------------------------------------------------|
| `HIGH`   | Multiple trigger cocok (COA + contact type + keyword)           |
| `MEDIUM` | 1–2 trigger cocok (misal hanya keyword atau hanya contact type) |
| `LOW`    | Hanya cocok berdasarkan keyword saja (bisa false positive)      |

#### Endpoint

```
/business/transactions/suggest-tax
    POST /     → analisis konteks, kembalikan saran PPh
                 body: { debitCoaId, creditCoaId, contactId?, amount, description? }
                 response: { suggestions[], notes? }

/business/tax/suggestion-rules
    GET    /   → list custom TaxSuggestionRule milik company
    POST   /   → tambah custom rule
    PUT    /:id → update custom rule
    DELETE /:id → hapus custom rule
```

> Endpoint ini dipanggil saat user **sedang mengisi form transaksi** (on-the-fly / debounced), bukan saat menyimpan.
> Tidak ada perubahan model `BusinessTransaction` — saran hanya informatif, keputusan tetap di user.

#### Contoh Skenario Saran

| Konteks Transaksi                                                      | Saran Muncul                    |
|------------------------------------------------------------------------|---------------------------------|
| Debit: Beban Gaji + Contact: Employee + desc: "Gaji Maret Andi"        | ✅ PPh 21 (HIGH)                |
| Debit: Beban Sewa + desc: "Sewa gedung kantor lantai 3"                | ✅ PPh 4(2) (HIGH)              |
| Debit: Beban Operasional + Contact: Vendor + desc: "Jasa konsultan IT" | ✅ PPh 23 (HIGH)                |
| Debit: Beban Operasional + Contact: Vendor + desc: "Beli ATK"          | ✅ PPh 22 (MEDIUM) — opsional   |
| Debit: Bank + Credit: Pendapatan Jasa + desc: "Penerimaan klien"       | ❌ Tidak ada saran (sisi penerima, bukan pemotong) |

---

#### Audit Log Tambahan (Tax Suggestion)
```
BUSINESS_TAX_SUGGESTION_RULE_CREATE
BUSINESS_TAX_SUGGESTION_RULE_UPDATE
```

---

*End of Document — v1.4 — 2026-03-24*
