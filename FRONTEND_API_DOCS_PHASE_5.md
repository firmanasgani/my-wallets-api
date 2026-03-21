# Business Plan - Phase 5 API Documentation

> **Financial Reports: P&L, Balance Sheet, Cash Flow, Jurnal Umum**
>
> Dokumen ini berisi spesifikasi lengkap API untuk Fase 5 yang harus diimplementasikan di sisi frontend.
> Baca dokumen Phase 1–4 terlebih dahulu sebelum dokumen ini.

---

## Base Setup & Autentikasi

Sama seperti phase sebelumnya:

1. Semua endpoint memerlukan header `Authorization: Bearer <token>`.
2. User harus memiliki **subscription Business aktif** *atau* menjadi **member aktif** dari company yang OWNER-nya punya subscription Business.
3. Seluruh endpoint Phase 5 menggunakan company yang ditemukan otomatis dari JWT user (via `CompanyMemberGuard`).

---

## Ringkasan Endpoint Phase 5

| Method | Endpoint | Role Minimum | Keterangan |
|--------|----------|:------------:|------------|
| `GET` | `/business/reports/profit-loss` | `VIEWER` | Laporan Laba Rugi (P&L) |
| `GET` | `/business/reports/balance-sheet` | `VIEWER` | Neraca Keuangan |
| `GET` | `/business/reports/cash-flow` | `VIEWER` | Arus Kas (simplified) |
| `GET` | `/business/reports/journal` | `VIEWER` | Jurnal Umum (kronologis) |

Semua endpoint bersifat **read-only** — tidak ada mutasi data.

---

## Catatan Penting: Keterbatasan MVP

> **Tidak ada Period Closing di Phase 5.**
>
> Semua laporan dihitung dari akumulasi `JournalEntry` + `openingBalance` COA sejak company dibuat.
> Akun REVENUE dan EXPENSE **tidak di-reset** tiap periode — nilainya kumulatif sepanjang waktu.
>
> Implikasi untuk frontend:
> - P&L **wajib** menggunakan `startDate` + `endDate` yang eksplisit agar laporan terbatas pada satu periode.
> - Balance Sheet menampilkan saldo kumulatif sejak awal, termasuk laba/rugi yang belum ditutup.
> - Tampilkan **disclaimer** di UI bahwa "Laporan ini belum termasuk Penutupan Periode (Period Closing)."

---

## 1. Laporan Laba Rugi (P&L)

### Endpoint

`GET /business/reports/profit-loss`

### Query Parameters

| Param | Tipe | Contoh | Keterangan |
|-------|------|--------|------------|
| `startDate` | string | `2026-01-01` | Opsional — awal periode (inklusif) |
| `endDate` | string | `2026-03-31` | Opsional — akhir periode (inklusif, sampai 23:59:59) |

> **Rekomendasi:** Selalu kirim `startDate` dan `endDate` agar laporan terbatas pada satu periode akuntansi.

### Response (200 OK)

```json
{
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-03-31"
  },
  "revenue": {
    "accounts": [
      { "coaCode": "4-001", "coaName": "Pendapatan Penjualan", "amount": "10000000.00" },
      { "coaCode": "4-002", "coaName": "Pendapatan Jasa",      "amount": "5000000.00" }
    ],
    "total": "15000000.00"
  },
  "expense": {
    "accounts": [
      { "coaCode": "5-001", "coaName": "Beban Operasional", "amount": "2000000.00" },
      { "coaCode": "5-002", "coaName": "Beban Gaji",        "amount": "8000000.00" },
      { "coaCode": "5-003", "coaName": "Beban Sewa",        "amount": "3000000.00" }
    ],
    "total": "13000000.00"
  },
  "netProfit": "2000000.00",
  "isProfit": true
}
```

### Catatan Frontend

- `amount` di setiap akun = **net movement** akun tersebut selama periode:
  - REVENUE: `credit - debit` (semakin besar = semakin baik)
  - EXPENSE: `debit - credit` (semakin besar = semakin besar beban)
- `netProfit` bisa negatif (rugi) — jika `isProfit: false`, tampilkan dengan warna merah dan label "Net Loss".
- Akun dengan nilai `0.00` tetap ditampilkan di list (COA yang ada di company tapi belum ada transaksi).

### Contoh Tampilan

```
┌───────────────────────────────────────────────────────────┐
│  Laporan Laba Rugi                                        │
│  Periode: 1 Jan 2026 – 31 Mar 2026                        │
├───────────────────────────────────────────────────────────┤
│  PENDAPATAN                                               │
│    4-001  Pendapatan Penjualan          Rp  10.000.000    │
│    4-002  Pendapatan Jasa               Rp   5.000.000    │
│                                        ──────────────     │
│    Total Pendapatan                     Rp  15.000.000    │
├───────────────────────────────────────────────────────────┤
│  BEBAN                                                    │
│    5-001  Beban Operasional             Rp   2.000.000    │
│    5-002  Beban Gaji                    Rp   8.000.000    │
│    5-003  Beban Sewa                    Rp   3.000.000    │
│                                        ──────────────     │
│    Total Beban                          Rp  13.000.000    │
├───────────────────────────────────────────────────────────┤
│  LABA BERSIH                            Rp   2.000.000 ✓  │
└───────────────────────────────────────────────────────────┘
```

---

## 2. Neraca Keuangan (Balance Sheet)

### Endpoint

`GET /business/reports/balance-sheet`

### Query Parameters

| Param | Tipe | Contoh | Keterangan |
|-------|------|--------|------------|
| `date` | string | `2026-03-31` | Opsional — posisi per tanggal ini (default: hari ini) |

### Response (200 OK)

```json
{
  "asOfDate": "2026-03-31T23:59:59.999Z",
  "assets": {
    "accounts": [
      { "coaCode": "1-001", "coaName": "Kas",           "balance": "5000000.00" },
      { "coaCode": "1-002", "coaName": "Bank",           "balance": "10550000.00" },
      { "coaCode": "1-003", "coaName": "Piutang Usaha",  "balance": "0.00" }
    ],
    "total": "15550000.00"
  },
  "liabilities": {
    "accounts": [
      { "coaCode": "2-001", "coaName": "Hutang Usaha",   "balance": "0.00" },
      { "coaCode": "2-002", "coaName": "Hutang Pajak PPN", "balance": "550000.00" }
    ],
    "total": "550000.00"
  },
  "equity": {
    "accounts": [
      { "coaCode": "3-001", "coaName": "Modal Pemilik",  "balance": "10000000.00" },
      { "coaCode": "3-002", "coaName": "Laba Ditahan",   "balance": "3000000.00" }
    ],
    "currentPeriodProfit": "2000000.00",
    "total": "15000000.00"
  },
  "totalLiabilitiesAndEquity": "15550000.00",
  "isBalanced": true
}
```

### Penjelasan Field

| Field | Keterangan |
|-------|------------|
| `assets.total` | Σ saldo semua COA type ASSET |
| `liabilities.total` | Σ saldo semua COA type LIABILITY |
| `equity.accounts` | Saldo COA type EQUITY (Modal Pemilik, Laba Ditahan) |
| `equity.currentPeriodProfit` | Net Profit kumulatif s/d tanggal (belum di-close ke Laba Ditahan) |
| `equity.total` | `equity accounts total` + `currentPeriodProfit` |
| `totalLiabilitiesAndEquity` | `liabilities.total` + `equity.total` |
| `isBalanced` | `assets.total == totalLiabilitiesAndEquity` (dalam toleransi Rp 0.01) |

### Rumus Saldo per COA

| Tipe COA | Normal Balance | Rumus Saldo |
|----------|:--------------:|-------------|
| `ASSET` | Debit | `openingBalance + Σdebit - Σcredit` |
| `EXPENSE` | Debit | `openingBalance + Σdebit - Σcredit` |
| `LIABILITY` | Credit | `openingBalance - Σdebit + Σcredit` |
| `EQUITY` | Credit | `openingBalance - Σdebit + Σcredit` |
| `REVENUE` | Credit | `openingBalance - Σdebit + Σcredit` |

> **Catatan:** COA type EXPENSE dan REVENUE tidak muncul di section `assets`, `liabilities`, `equity` di response — mereka dikalkulasi sebagai `currentPeriodProfit` (Revenue - Expense) yang digabungkan ke Equity.

### Catatan Frontend

- Tampilkan badge **"Neraca Seimbang ✓"** jika `isBalanced: true`.
- Jika `isBalanced: false`, tampilkan warning: "⚠️ Neraca tidak seimbang — kemungkinan ada jurnal yang belum terekam."
- `currentPeriodProfit` ditampilkan sebagai baris terpisah di section Ekuitas:
  ```
  Modal Pemilik    Rp 10.000.000
  Laba Ditahan     Rp  3.000.000
  Laba Periode Ini Rp  2.000.000   ← currentPeriodProfit
  ─────────────────────────────
  Total Ekuitas    Rp 15.000.000
  ```

---

## 3. Arus Kas (Cash Flow)

### Endpoint

`GET /business/reports/cash-flow`

### Query Parameters

| Param | Tipe | Contoh | Keterangan |
|-------|------|--------|------------|
| `startDate` | string | `2026-01-01` | Opsional — awal periode |
| `endDate` | string | `2026-03-31` | Opsional — akhir periode |

### Response (200 OK)

```json
{
  "period": {
    "startDate": "2026-01-01",
    "endDate": "2026-03-31"
  },
  "openingCash": "10000000.00",
  "cashInflows": [
    { "coaCode": "1-002", "coaName": "Bank", "amount": "5550000.00" }
  ],
  "totalInflow": "5550000.00",
  "cashOutflows": [
    { "coaCode": "1-001", "coaName": "Kas",  "amount": "3000000.00" },
    { "coaCode": "1-002", "coaName": "Bank", "amount": "5000000.00" }
  ],
  "totalOutflow": "8000000.00",
  "netCashFlow": "-2450000.00",
  "endingCash": "7550000.00"
}
```

### Penjelasan Field

| Field | Keterangan |
|-------|------------|
| `openingCash` | Σ `openingBalance` semua COA type ASSET |
| `cashInflows` | Akun ASSET yang menerima DEBIT selama periode (kas masuk) |
| `cashOutflows` | Akun ASSET yang menerima CREDIT selama periode (kas keluar) |
| `netCashFlow` | `totalInflow - totalOutflow` (bisa negatif) |
| `endingCash` | `openingCash + netCashFlow` |

> **⚠️ Simplifikasi MVP:** Laporan ini menggunakan **semua COA type ASSET** (termasuk Piutang Usaha).
> Ini adalah pendekatan simplified — bukan Cash Flow statement formal PSAK.
> Saat fitur Period Closing ditambahkan di masa mendatang, laporan ini akan diperbarui untuk hanya mencakup akun kas fisik (Kas & Bank).

### Catatan Frontend

- `netCashFlow` bisa negatif — tampilkan dengan warna merah jika `< 0`.
- COA yang tidak punya movement selama periode tidak muncul di `cashInflows`/`cashOutflows`.
- Tampilkan disclaimer kecil: *"Laporan arus kas ini adalah penyederhanaan. Mencakup semua pergerakan akun Aset."*

---

## 4. Jurnal Umum (General Journal)

### Endpoint

`GET /business/reports/journal`

### Query Parameters

| Param | Tipe | Contoh | Keterangan |
|-------|------|--------|------------|
| `startDate` | string | `2026-01-01` | Opsional — filter tanggal mulai |
| `endDate` | string | `2026-03-31` | Opsional — filter tanggal akhir |
| `page` | number | `1` | Opsional — default: 1 |
| `limit` | number | `20` | Opsional — default: 20, max: 100 |

### Response (200 OK)

```json
{
  "data": [
    {
      "id": "uuid",
      "date": "2026-03-19T00:00:00.000Z",
      "description": "Penerimaan Invoice INV-2026-03-0001",
      "reference": "INV-2026-03-0001",
      "contacts": ["Budi Santoso"],
      "isSystemGenerated": true,
      "debitLines": [
        {
          "coaCode": "1-002",
          "coaName": "Bank",
          "amount": "5550000.00",
          "description": null,
          "contact": null
        }
      ],
      "creditLines": [
        {
          "coaCode": "4-001",
          "coaName": "Pendapatan Penjualan",
          "amount": "5550000.00",
          "description": null,
          "contact": "Budi Santoso"
        }
      ],
      "totalDebit": "5550000.00",
      "totalCredit": "5550000.00"
    },
    {
      "id": "uuid",
      "date": "2026-03-25T00:00:00.000Z",
      "description": "Gaji Maret",
      "reference": null,
      "contacts": ["Andi Pratama"],
      "isSystemGenerated": false,
      "debitLines": [
        {
          "coaCode": "5-002",
          "coaName": "Beban Gaji",
          "amount": "5000000.00",
          "description": "Gaji Andi",
          "contact": "Andi Pratama"
        }
      ],
      "creditLines": [
        {
          "coaCode": "1-002",
          "coaName": "Bank",
          "amount": "5000000.00",
          "description": null,
          "contact": null
        }
      ],
      "totalDebit": "5000000.00",
      "totalCredit": "5000000.00"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

### Penjelasan Field

| Field | Keterangan |
|-------|------------|
| `reference` | `invoiceNumber` jika jurnal berasal dari invoice, `null` jika manual |
| `contacts` | Array nama contact yang terlibat (unique, dari semua lines) |
| `isSystemGenerated` | `true` = dari invoice (tidak bisa dihapus), `false` = manual |
| `debitLines` / `creditLines` | Baris jurnal dipisah per tipe untuk kemudahan tampilan |
| `totalDebit` / `totalCredit` | Harus selalu sama (double-entry balance) |

### Catatan Frontend

- Data diurutkan berdasarkan `transactionDate ASC` (kronologis) lalu `createdAt ASC`.
- Gunakan badge untuk `isSystemGenerated`:
  - `true` → badge biru **"Dari Invoice"** + tampilkan `reference`
  - `false` → badge abu-abu **"Manual"**
- Untuk entry compound (banyak baris), tampilkan semua baris debit dan credit.
- Halaman ini bisa digunakan sebagai **audit trail** transaksi akuntansi.

### Contoh Tampilan

```
┌──────────────┬──────────────────────────────┬─────────────┬──────────────┐
│ Tanggal      │ Keterangan                   │ Debit       │ Credit       │
├──────────────┼──────────────────────────────┼─────────────┼──────────────┤
│ 19 Mar 2026  │ [Dari Invoice INV-2026-03-0001]             │              │
│              │   1-002 Bank                 │ 5.550.000   │              │
│              │   4-001 Pendapatan Penjualan │             │ 5.550.000    │
├──────────────┼──────────────────────────────┼─────────────┼──────────────┤
│ 25 Mar 2026  │ [Manual] Gaji Maret          │             │              │
│              │   5-002 Beban Gaji (Andi)    │ 5.000.000   │              │
│              │   1-002 Bank                 │             │ 5.000.000    │
└──────────────┴──────────────────────────────┴─────────────┴──────────────┘
```

---

## 5. Tipe Data Referensi

### P&L Response

```typescript
{
  period: { startDate: string | null; endDate: string | null };
  revenue: {
    accounts: { coaCode: string; coaName: string; amount: string }[];
    total: string;
  };
  expense: {
    accounts: { coaCode: string; coaName: string; amount: string }[];
    total: string;
  };
  netProfit: string;   // Decimal string, bisa negatif
  isProfit: boolean;
}
```

### Balance Sheet Response

```typescript
{
  asOfDate: string;    // ISO 8601
  assets: {
    accounts: { coaCode: string; coaName: string; balance: string }[];
    total: string;
  };
  liabilities: {
    accounts: { coaCode: string; coaName: string; balance: string }[];
    total: string;
  };
  equity: {
    accounts: { coaCode: string; coaName: string; balance: string }[];
    currentPeriodProfit: string;   // bisa negatif (rugi)
    total: string;
  };
  totalLiabilitiesAndEquity: string;
  isBalanced: boolean;
}
```

### Cash Flow Response

```typescript
{
  period: { startDate: string | null; endDate: string | null };
  openingCash: string;
  cashInflows:  { coaCode: string; coaName: string; amount: string }[];
  totalInflow:  string;
  cashOutflows: { coaCode: string; coaName: string; amount: string }[];
  totalOutflow: string;
  netCashFlow:  string;   // bisa negatif
  endingCash:   string;
}
```

### Journal Entry Response

```typescript
{
  id: string;
  date: string;              // ISO 8601
  description: string;
  reference: string | null;  // invoiceNumber jika dari invoice
  contacts: string[] | null; // nama-nama contact yang terlibat
  isSystemGenerated: boolean;
  debitLines: JournalReportLine[];
  creditLines: JournalReportLine[];
  totalDebit: string;
  totalCredit: string;
}

type JournalReportLine = {
  coaCode: string;
  coaName: string;
  amount: string;            // Decimal sebagai string
  description: string | null;
  contact: string | null;    // nama contact
}
```

> **Penting:** Semua field `amount`, `balance`, `total`, `netProfit`, `netCashFlow`, dst. dikembalikan sebagai **string** (format desimal 2 angka, contoh: `"5000000.00"`). Parse ke `number` atau gunakan `decimal.js` / `big.js` untuk operasi aritmetika di frontend.

---

## 6. Kontrol per Role

| Aksi | VIEWER | STAFF | ADMIN | OWNER |
|------|:------:|:-----:|:-----:|:-----:|
| Lihat P&L | ✅ | ✅ | ✅ | ✅ |
| Lihat Balance Sheet | ✅ | ✅ | ✅ | ✅ |
| Lihat Cash Flow | ✅ | ✅ | ✅ | ✅ |
| Lihat Jurnal Umum | ✅ | ✅ | ✅ | ✅ |

Semua laporan dapat diakses oleh semua role (minimum VIEWER).

---

## 7. Contoh Alur Lengkap: Generate Laporan Bulanan

```
1. Pilih periode (misal: Maret 2026)
   startDate = "2026-03-01"
   endDate   = "2026-03-31"

2. P&L bulan Maret
   GET /business/reports/profit-loss?startDate=2026-03-01&endDate=2026-03-31
   → Tampilkan breakdown pendapatan vs beban, net profit/loss

3. Arus Kas bulan Maret
   GET /business/reports/cash-flow?startDate=2026-03-01&endDate=2026-03-31
   → Tampilkan pergerakan kas masuk/keluar, posisi akhir

4. Neraca per akhir Maret
   GET /business/reports/balance-sheet?date=2026-03-31
   → Tampilkan posisi aset, liabilitas, ekuitas per 31 Maret

5. Jurnal Umum bulan Maret (audit trail)
   GET /business/reports/journal?startDate=2026-03-01&endDate=2026-03-31&page=1&limit=50
   → Tampilkan semua entri jurnal kronologis
```

---

*End of Document — Phase 5 Frontend API Docs — v1.0 — 2026-03-21*
