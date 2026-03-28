# Business Plan - Phase 6 API Documentation

> **KPI Dashboard**
>
> Dokumen ini berisi spesifikasi lengkap API untuk Fase 6 yang harus diimplementasikan di sisi frontend.
> Baca dokumen Phase 1–5 terlebih dahulu sebelum dokumen ini.

---

## Base Setup & Autentikasi

Sama seperti phase sebelumnya:

1. Semua endpoint memerlukan header `Authorization: Bearer <token>`.
2. User harus memiliki **subscription Business aktif** *atau* menjadi **member aktif** dari company yang OWNER-nya punya subscription Business.
3. Endpoint Phase 6 menggunakan company yang ditemukan otomatis dari JWT user (via `CompanyMemberGuard`).

---

## Ringkasan Endpoint Phase 6

| Method | Endpoint | Role Minimum | Keterangan |
|--------|----------|:------------:|------------|
| `GET` | `/business/kpi` | `VIEWER` | KPI Dashboard (bulan berjalan) |

Endpoint bersifat **read-only** dan **tidak menerima query parameter** — data selalu mengacu pada **bulan kalender berjalan** secara otomatis.

---

## Endpoint: KPI Dashboard

### `GET /business/kpi`

### Query Parameters

Tidak ada. Semua data dihitung berdasarkan bulan berjalan (current calendar month).

### Response (200 OK)

```json
{
  "profitability": {
    "period": { "month": 3, "year": 2026 },
    "totalRevenue": "15000000.00",
    "totalExpense": "8500000.00",
    "netProfit": "6500000.00",
    "isProfit": true,
    "profitMargin": "43.33",
    "revenueGrowth": "12.50"
  },
  "liquidity": {
    "cashPosition": "22000000.00",
    "totalReceivable": "5000000.00",
    "totalPayable": "1200000.00"
  },
  "invoiceActivity": {
    "totalSentThisMonth": 8,
    "totalPaidThisMonth": 5,
    "totalOverdue": 2,
    "overdueAmount": "3500000.00",
    "outstandingAmount": "6200000.00"
  },
  "breakdown": {
    "topRevenueAccounts": [
      { "coaCode": "4-001", "coaName": "Pendapatan Penjualan", "amount": "10000000.00" },
      { "coaCode": "4-002", "coaName": "Pendapatan Jasa",      "amount": "5000000.00" }
    ],
    "topExpenseAccounts": [
      { "coaCode": "5-002", "coaName": "Beban Gaji",        "amount": "5000000.00" },
      { "coaCode": "5-001", "coaName": "Beban Operasional", "amount": "2500000.00" },
      { "coaCode": "5-003", "coaName": "Beban Sewa",        "amount": "1000000.00" }
    ]
  }
}
```

---

## Penjelasan Detail per Seksi

### 1. `profitability` — Profitabilitas Bulan Ini

Semua nilai dihitung dari `JournalLine` yang `transactionDate`-nya jatuh di bulan berjalan.

| Field | Tipe | Keterangan |
|-------|------|------------|
| `period.month` | `number` | Bulan berjalan (1–12) |
| `period.year` | `number` | Tahun berjalan |
| `totalRevenue` | `string` | Total pendapatan bulan ini — akumulasi CREDIT pada semua COA type `REVENUE` |
| `totalExpense` | `string` | Total beban bulan ini — akumulasi DEBIT pada semua COA type `EXPENSE` |
| `netProfit` | `string` | `totalRevenue - totalExpense` — bisa negatif (rugi) |
| `isProfit` | `boolean` | `true` jika `netProfit >= 0` |
| `profitMargin` | `string` | `(netProfit / totalRevenue) * 100` dalam persen — `"0.00"` jika belum ada revenue |
| `revenueGrowth` | `string \| null` | Pertumbuhan revenue vs bulan lalu dalam persen — `null` jika bulan lalu belum ada revenue sama sekali |

**Catatan `revenueGrowth`:**
- Nilai positif → revenue naik dibanding bulan lalu (misal `"12.50"` = naik 12,5%)
- Nilai negatif → revenue turun (misal `"-8.33"` = turun 8,33%)
- `null` → bulan lalu tidak ada revenue (tidak bisa dihitung pertumbuhan)

**Rumus sumber data:**
```
totalRevenue  = Σ (JournalLine CREDIT → COA type REVENUE, bulan ini)
totalExpense  = Σ (JournalLine DEBIT  → COA type EXPENSE, bulan ini)
profitMargin  = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
revenueGrowth = prevRevenue > 0 ? ((curRevenue - prevRevenue) / prevRevenue) * 100 : null
```

---

### 2. `liquidity` — Posisi Kas & Kewajiban

Semua nilai merupakan **saldo kumulatif** (tidak terbatas bulan ini) — dihitung dari `openingBalance` COA + seluruh pergerakan `JournalLine` hingga saat ini.

| Field | Tipe | Keterangan |
|-------|------|------------|
| `cashPosition` | `string` | Saldo COA **1-001 (Kas)** + **1-002 (Bank)** saja — kas fisik yang liquid |
| `totalReceivable` | `string` | Saldo COA **1-003 (Piutang Usaha)** — piutang yang belum diterima |
| `totalPayable` | `string` | Saldo COA **2-001 (Hutang Usaha)** — kewajiban yang belum dibayar |

> **Penting:** `cashPosition` **hanya** mencakup Kas (1-001) dan Bank (1-002), **bukan** semua COA type ASSET.
> Piutang Usaha (1-003) sengaja dipisah sebagai `totalReceivable` agar frontend bisa menampilkan perbedaan antara **kas nyata** dan **tagihan yang belum cair**.

**Rumus saldo per COA (ASSET — debit normal):**
```
saldo = openingBalance + Σdebit - Σcredit
```

**Rumus saldo COA 2-001 (LIABILITY — credit normal):**
```
saldo = openingBalance - Σdebit + Σcredit
```

---

### 3. `invoiceActivity` — Aktivitas Invoice Bulan Ini

| Field | Tipe | Keterangan |
|-------|------|------------|
| `totalSentThisMonth` | `number` | Jumlah invoice yang **dikirim** (`sentAt`) di bulan ini (berapapun status saat ini) |
| `totalPaidThisMonth` | `number` | Jumlah invoice yang **dilunasi** (`paidAt`) di bulan ini |
| `totalOverdue` | `number` | Jumlah invoice berstatus `OVERDUE` saat ini (tidak terbatas bulan ini) |
| `overdueAmount` | `string` | Total nilai invoice `OVERDUE` saat ini |
| `outstandingAmount` | `string` | Total nilai invoice yang masih harus dibayar (`SENT` + `OVERDUE`) |

> **Perbedaan scope tanggal:**
> - `totalSentThisMonth` dan `totalPaidThisMonth` → **filter bulan berjalan** (activity tracker)
> - `totalOverdue`, `overdueAmount`, `outstandingAmount` → **snapshot kondisi saat ini** (tanpa filter tanggal)

---

### 4. `breakdown` — Rincian Akun Terbesar

| Field | Tipe | Keterangan |
|-------|------|------------|
| `topRevenueAccounts` | `array` | Maksimal **5 COA REVENUE** dengan nilai terbesar bulan ini, diurutkan DESC |
| `topExpenseAccounts` | `array` | Maksimal **5 COA EXPENSE** dengan nilai terbesar bulan ini, diurutkan DESC |

Setiap item dalam array:

| Field | Tipe | Keterangan |
|-------|------|------------|
| `coaCode` | `string` | Kode akun (contoh: `"4-001"`) |
| `coaName` | `string` | Nama akun (contoh: `"Pendapatan Penjualan"`) |
| `amount` | `string` | Net movement bulan ini (bisa `"0.00"` jika COA ada tapi belum ada transaksi) |

> **Catatan:** Hanya COA dengan transaksi yang muncul di top list — COA dengan nilai `"0.00"` tidak diurutkan ke atas.

---

## Tipe Data TypeScript (untuk Frontend)

```typescript
// GET /business/kpi
interface KpiDashboardResponse {
  profitability: {
    period:        { month: number; year: number };
    totalRevenue:  string;   // Decimal string
    totalExpense:  string;   // Decimal string
    netProfit:     string;   // Decimal string, bisa negatif
    isProfit:      boolean;
    profitMargin:  string;   // Persentase (%), contoh "43.33"
    revenueGrowth: string | null; // Persentase (%), bisa negatif, null jika data bulan lalu = 0
  };
  liquidity: {
    cashPosition:    string;  // Saldo Kas + Bank
    totalReceivable: string;  // Saldo Piutang Usaha
    totalPayable:    string;  // Saldo Hutang Usaha
  };
  invoiceActivity: {
    totalSentThisMonth: number;
    totalPaidThisMonth: number;
    totalOverdue:       number;
    overdueAmount:      string;    // Decimal string
    outstandingAmount:  string;    // Decimal string
  };
  breakdown: {
    topRevenueAccounts: KpiCoaItem[];
    topExpenseAccounts: KpiCoaItem[];
  };
}

interface KpiCoaItem {
  coaCode: string;
  coaName: string;
  amount:  string;  // Decimal string
}
```

> **Penting:** Semua field bertipe `string` di atas adalah angka desimal format `"15000000.00"`.
> Gunakan `parseFloat()`, `Number()`, atau library seperti `decimal.js` / `big.js` untuk operasi aritmetika di frontend. **Jangan bandingkan string langsung.**

---

## Panduan Tampilan UI

### Layout Dashboard yang Disarankan

```
┌─────────────────────────────────────────────────────────────────┐
│  KPI Dashboard — Maret 2026                                     │
├─────────────┬──────────────┬──────────────┬────────────────────┤
│  PROFITABILITAS             │  POSISI KAS & KEWAJIBAN           │
├─────────────────────────────┼───────────────────────────────────┤
│  Pendapatan    Rp 15.000.000 │  Kas & Bank      Rp 22.000.000   │
│  Beban          Rp 8.500.000 │  Piutang          Rp  5.000.000  │
│  ─────────────────────────  │  Hutang           Rp  1.200.000   │
│  Laba Bersih   Rp 6.500.000 │                                   │
│  Margin        43.33%        │                                   │
│  Pertumbuhan ▲ 12.50%        │                                   │
├─────────────────────────────┴───────────────────────────────────┤
│  AKTIVITAS INVOICE BULAN INI                                    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│  Dikirim: 8  │  Dibayar: 5  │  Terlambat: 2│  Outstanding: 6,2jt│
├─────────────────────────────┬───────────────────────────────────┤
│  TOP PENDAPATAN              │  TOP BEBAN                       │
│  4-001 Penjualan  10.000.000 │  5-002 Gaji       5.000.000      │
│  4-002 Jasa        5.000.000 │  5-001 Operasional 2.500.000     │
│                              │  5-003 Sewa        1.000.000     │
└──────────────────────────────┴───────────────────────────────────┘
```

### Petunjuk Rendering per Field

**`netProfit` / `isProfit`:**
- `isProfit: true` → warna hijau, label **"Laba Bersih"**
- `isProfit: false` → warna merah, label **"Rugi Bersih"**

**`profitMargin`:**
- Tampilkan dengan simbol `%`, contoh: `43.33%`
- Jika `totalRevenue = "0.00"` → tampilkan `"—"` (tidak relevan)

**`revenueGrowth`:**
- `null` → tampilkan `"—"` atau tooltip *"Data bulan lalu belum tersedia"*
- Nilai positif → ikon `▲` warna hijau, contoh: `▲ 12.50%`
- Nilai negatif → ikon `▼` warna merah, contoh: `▼ 8.33%`

**`cashPosition` vs `totalReceivable`:**
- Tampilkan keduanya berdampingan agar terlihat perbedaan kas nyata vs piutang
- Tambahkan tooltip: *"Kas & Bank = dana yang sudah tersedia. Piutang = tagihan yang belum diterima."*

**`totalOverdue` / `overdueAmount`:**
- Jika `totalOverdue > 0` → tampilkan badge merah dengan jumlah invoice, angka `overdueAmount` berwarna merah
- Tambahkan link navigasi ke halaman Invoice dengan filter `status=OVERDUE`

**`outstandingAmount`:**
- Tampilkan sebagai total tagihan yang masih menunggu pembayaran
- Tooltip: *"Invoice SENT + OVERDUE yang belum dibayar"*

**`topRevenueAccounts` / `topExpenseAccounts`:**
- Tampilkan sebagai list horizontal bar chart atau tabel sederhana
- Urutkan sudah dari terbesar — tinggal render saja
- Jika array kosong (`[]`) → tampilkan *"Belum ada transaksi bulan ini"*

---

## Kontrol per Role

| Aksi | VIEWER | STAFF | ADMIN | OWNER |
|------|:------:|:-----:|:-----:|:-----:|
| Lihat KPI Dashboard | ✅ | ✅ | ✅ | ✅ |

Semua role (minimum VIEWER) dapat mengakses dashboard ini.

---

## Error Responses

| HTTP Status | Kode Error | Penyebab |
|-------------|------------|----------|
| `401` | `UNAUTHORIZED` | Token tidak valid atau expired |
| `403` | `FORBIDDEN` | User tidak punya subscription Business aktif |
| `403` | `FORBIDDEN` | User bukan member aktif dari company manapun |

---

## Catatan Penting untuk Frontend

1. **Tidak perlu kirim parameter apapun** — cukup `GET /business/kpi`. Backend otomatis menghitung bulan berjalan.

2. **`revenueGrowth` bisa `null`** — tangani dengan null-check sebelum menampilkan persentase.

3. **Semua angka desimal dikembalikan sebagai `string`** — jangan lupa parse ke `number` atau `Decimal` sebelum operasi matematika.

4. **`cashPosition` bukan total aset** — hanya COA Kas (1-001) + Bank (1-002). Piutang Usaha ada di field terpisah `totalReceivable`.

5. **`totalOverdue` tidak terbatas bulan ini** — ini adalah jumlah invoice yang saat ini berstatus OVERDUE, bisa dari bulan-bulan sebelumnya.

6. **`topRevenueAccounts` dan `topExpenseAccounts` bisa kurang dari 5 item** — tergantung berapa COA yang punya transaksi bulan ini.

7. **Data bersifat real-time** — tidak ada cache, setiap request menghitung ulang dari database. Pertimbangkan untuk membatasi frekuensi polling di frontend (misal refresh setiap 5 menit, atau on-demand saja).

---

## Contoh Alur Frontend

```
1. User buka halaman Dashboard
   → GET /business/kpi
   → Render semua 4 seksi sekaligus

2. User klik angka "Terlambat: 2"
   → Navigate ke /business/invoices?status=OVERDUE

3. User klik "Lihat detail Laba Rugi"
   → Navigate ke halaman Reports → P&L
   → GET /business/reports/profit-loss?startDate=2026-03-01&endDate=2026-03-31

4. User refresh manual / interval
   → GET /business/kpi (ulang)
```

---

*End of Document — Phase 6 Frontend API Docs — v1.0 — 2026-03-22*
