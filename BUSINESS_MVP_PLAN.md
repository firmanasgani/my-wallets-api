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

---

*End of Document — v1.2 — 2026-03-19*
