# Business Plan - Phase 1 API Documentation

Dokumen ini berisi spesifikasi API untuk Fase 1 (Company Setup & Chart of Accounts) yang harus diimplementasikan di sisi frontend.

---

## Base Setup & Autentikasi
1. Semua endpoint memerlukan Header `Authorization: Bearer <token>`.
2. Seluruh user yang ingin mengakses modul Business ini **harus** memiliki paket *subscription* bisnis yang aktif (`BUSINESS_1M`, `BUSINESS_6M`, atau `BUSINESS_12M`). Jika tidak, API akan mengembalikan status `403 Forbidden` (ditolak oleh `BusinessSubscriptionGuard`).

---

## 1. Company API

### 1.1 Create Company (Onboarding)
Digunakan saat user bisnis pertama kali membuat perusahaan.
Endpoint ini akan otomatis menjadikan user sebagai `OWNER` dari company tersebut dan akan men-generate *Chart of Accounts* (COA) default.

- **Endpoint:** `POST /business/company`
- **Request Body:**
  ```json
  {
    "name": "string",            // Wajib
    "npwp": "string",            // Opsional
    "address": "string",         // Opsional
    "phone": "string",           // Opsional
    "email": "string",           // Opsional (harus format email valid)
    "taxEnabled": boolean,       // Opsional (default: true)
    "taxRate": number,           // Opsional (default: 11, max: 100, min: 0)
    "currency": "string"         // Opsional (default: "IDR")
  }
  ```
- **Response (201 Created):** Objek `Company` lengkap yang baru dibuat.

### 1.2 Get My Company
Mengambil detail informasi perusahaan di mana user saat ini terdaftar sebagai member aktif.

- **Endpoint:** `GET /business/company`
- **Authorization khusus:** User harus merupakan member aktif di suatu perusahaan.
- **Response (200 OK):** Objek `Company`.

### 1.3 Update Company
Mengubah profil perusahaan.

- **Endpoint:** `PUT /business/company`
- **Authorization khusus:** User harus terdaftar sebagai member dengan Role **`OWNER`** atau **`ADMIN`**. Role di bawah itu akan mendapat respons `403 Forbidden`.
- **Request Body:** Semua field bersifat *opsional*.
  ```json
  {
    "name": "string",
    "npwp": "string",
    "address": "string",
    "phone": "string",
    "email": "string",
    "taxEnabled": boolean,
    "taxRate": number,
    "currency": "string"
  }
  ```
- **Response (200 OK):** Objek `Company` yang telah diperbarui.

---

## 2. Chart of Accounts (COA) API

### 2.1 Get All Chart of Accounts
Mengambil daftar seluruh *Chart of Accounts* (Akun Perkiraan Akuntansi) milik perusahaan user. Akun-akun dasar secara otomatis di-generate (sebanyak 12 tipe dasar) saat pembuatan company pertama kali.

- **Endpoint:** `GET /business/chart-of-accounts`
- **Authorization khusus:** User harus merupakan member (status `ACTIVE`) dari perusahaan (Semua role diizinkan untuk melihat data ini).
- **Response (200 OK):** Array of `ChartOfAccount` objects.
  ```json
  [
    {
      "id": "uuid",
      "companyId": "uuid",
      "code": "1-001",
      "name": "Kas",
      "type": "ASSET",
      "isSystem": true,
      "createdAt": "datetime",
      "updatedAt": "datetime"
    },
    ...
  ]
  ```

---
> **Catatan untuk Frontend / Web Client:** 
> Jangan lupa untuk menangkap/mengakomodasi HTTP Status `403 Forbidden` secara global pada module Business untuk me-redirect user kembali ke halaman **Pricing/Upgrade Plan** apabila subscription-nya tidak valid atau sudah expire.
