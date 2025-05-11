// prisma/seed.ts
import { PrismaClient, CategoryType } from '@prisma/client';

const prisma = new PrismaClient();

// Definisikan struktur kategori dengan anak-anaknya
const defaultCategoriesSeed = [
  // --- INCOME CATEGORIES ---
  { name: 'Gaji', type: CategoryType.INCOME, icon: 'briefcase', color: '#4CAF50', children: [] },
  { name: 'Bonus', type: CategoryType.INCOME, icon: 'gift', color: '#8BC34A', children: [] },
  { name: 'Pendapatan Usaha', type: CategoryType.INCOME, icon: 'store', color: '#CDDC39', children: [] },
  { name: 'Investasi', type: CategoryType.INCOME, icon: 'chart-line', color: '#00BCD4', children: [] },
  { name: 'Hadiah Diterima', type: CategoryType.INCOME, icon: 'hand-holding-usd', color: '#009688', children: [] },
  { name: 'Freelance/Pekerjaan Sampingan', type: CategoryType.INCOME, icon: 'laptop-code', color: '#3F51B5', children: [] },
  { name: 'Lainnya (Pemasukan)', type: CategoryType.INCOME, icon: 'ellipsis-h', color: '#795548', children: [] },

  // --- EXPENSE CATEGORIES ---
  {
    name: 'Makanan & Minuman', type: CategoryType.EXPENSE, icon: 'utensils', color: '#FF9800', children: [
      { name: 'Belanja Bahan Makanan', type: CategoryType.EXPENSE, icon: 'shopping-basket', color: '#FFC107' },
      { name: 'Makan di Luar/Pesan Antar', type: CategoryType.EXPENSE, icon: 'concierge-bell', color: '#FFA726' },
      { name: 'Kopi & Minuman', type: CategoryType.EXPENSE, icon: 'coffee', color: '#FFB74D' },
    ],
  },
  {
    name: 'Transportasi', type: CategoryType.EXPENSE, icon: 'car-side', color: '#2196F3', children: [
      { name: 'Bahan Bakar', type: CategoryType.EXPENSE, icon: 'gas-pump', color: '#64B5F6' },
      { name: 'Transportasi Umum', type: CategoryType.EXPENSE, icon: 'bus-alt', color: '#90CAF9' },
      { name: 'Parkir & Tol', type: CategoryType.EXPENSE, icon: 'parking', color: '#42A5F5' },
      { name: 'Perawatan Kendaraan', type: CategoryType.EXPENSE, icon: 'tools', color: '#1E88E5' },
    ],
  },
  {
    name: 'Tempat Tinggal', type: CategoryType.EXPENSE, icon: 'home', color: '#F44336', children: [
      { name: 'Sewa / Cicilan KPR', type: CategoryType.EXPENSE, icon: 'file-invoice-dollar', color: '#E57373' },
      { name: 'Tagihan Utilitas', type: CategoryType.EXPENSE, icon: 'bolt', color: '#EF5350' }, // Listrik, Air, Gas
      { name: 'Internet & TV Kabel', type: CategoryType.EXPENSE, icon: 'wifi', color: '#F06292' },
      { name: 'Perawatan & Perbaikan Rumah', type: CategoryType.EXPENSE, icon: 'hammer', color: '#E53935' },
    ],
  },
  {
    name: 'Kebutuhan Pribadi', type: CategoryType.EXPENSE, icon: 'user-tie', color: '#9C27B0', children: [
      { name: 'Pakaian & Alas Kaki', type: CategoryType.EXPENSE, icon: 'tshirt', color: '#BA68C8' },
      { name: 'Perawatan Diri', type: CategoryType.EXPENSE, icon: 'spa', color: '#CE93D8' }, // Sabun, Sampo, Skincare
      { name: 'Potong Rambut & Salon', type: CategoryType.EXPENSE, icon: 'cut', color: '#AB47BC' },
    ],
  },
  {
    name: 'Kesehatan', type: CategoryType.EXPENSE, icon: 'heartbeat', color: '#E91E63', children: [
      { name: 'Dokter & Rumah Sakit', type: CategoryType.EXPENSE, icon: 'hospital-alt', color: '#EC407A' },
      { name: 'Obat-obatan & Suplemen', type: CategoryType.EXPENSE, icon: 'pills', color: '#F06292' },
      { name: 'Asuransi Kesehatan', type: CategoryType.EXPENSE, icon: 'file-medical-alt', color: '#AD1457' },
    ],
  },
  {
    name: 'Pendidikan', type: CategoryType.EXPENSE, icon: 'graduation-cap', color: '#673AB7', children: [
      { name: 'Biaya Sekolah/Kuliah', type: CategoryType.EXPENSE, icon: 'school', color: '#9575CD' },
      { name: 'Buku & Alat Tulis', type: CategoryType.EXPENSE, icon: 'book-open', color: '#7E57C2' },
      { name: 'Kursus & Pelatihan', type: CategoryType.EXPENSE, icon: 'chalkboard-teacher', color: '#5E35B1' },
    ],
  },
  {
    name: 'Hiburan', type: CategoryType.EXPENSE, icon: 'film', color: '#3F51B5', children: [
      { name: 'Langganan Digital', type: CategoryType.EXPENSE, icon: 'play-circle', color: '#7986CB' }, // Streaming, Aplikasi
      { name: 'Film, Konser, Acara', type: CategoryType.EXPENSE, icon: 'ticket-alt', color: '#5C6BC0' },
      { name: 'Hobi & Rekreasi', type: CategoryType.EXPENSE, icon: 'gamepad', color: '#3949AB' },
      { name: 'Liburan & Perjalanan', type: CategoryType.EXPENSE, icon: 'plane-departure', color: '#303F9F' },
    ],
  },
  {
    name: 'Tagihan Lainnya', type: CategoryType.EXPENSE, icon: 'file-invoice', color: '#03A9F4', children: [
      { name: 'Tagihan Telepon & Seluler', type: CategoryType.EXPENSE, icon: 'mobile-alt', color: '#4FC3F7' },
      { name: 'Cicilan Pinjaman (Non-KPR)', type: CategoryType.EXPENSE, icon: 'landmark', color: '#29B6F6' },
    ],
  },
  {
    name: 'Anak-anak', type: CategoryType.EXPENSE, icon: 'child', color: '#FFEB3B', children: [
      { name: 'Perlengkapan Bayi/Anak', type: CategoryType.EXPENSE, icon: 'baby-carriage', color: '#FFF176' },
      { name: 'Uang Saku Anak', type: CategoryType.EXPENSE, icon: 'coins', color: '#FFEE58' },
    ],
  },
  { name: 'Hadiah Diberikan & Donasi', type: CategoryType.EXPENSE, icon: 'hand-holding-heart', color: '#795548', children: [] },
  { name: 'Pajak', type: CategoryType.EXPENSE, icon: 'balance-scale', color: '#607D8B', children: [] },
  { name: 'Lainnya (Pengeluaran)', type: CategoryType.EXPENSE, icon: 'ellipsis-h', color: '#9E9E9E', children: [] },
];

async function main() {
  console.log(`Start seeding default categories ...`);

  for (const catData of defaultCategoriesSeed) {
    // Coba cari parent category berdasarkan nama, tipe, dan userId null (global), parentId null (top-level)
    let parentCategory = await prisma.category.findFirst({
      where: {
        categoryName: catData.name,
        categoryType: catData.type,
        userId: null,
        parentCategoryId: null, // Memastikan ini adalah top-level category
      },
    });

    if (!parentCategory) {
      parentCategory = await prisma.category.create({
        data: {
          categoryName: catData.name,
          categoryType: catData.type,
          userId: null, // Kategori global
          parentCategoryId: null,
          icon: catData.icon,
          color: catData.color,
        },
      });
      console.log(`Created top-level category: ${parentCategory.categoryName}`);
    } else {
      // Jika sudah ada, update icon dan color saja jika berbeda
      if(parentCategory.icon !== catData.icon || parentCategory.color !== catData.color){
          parentCategory = await prisma.category.update({
            where: { id: parentCategory.id },
            data: { icon: catData.icon, color: catData.color }
          });
          console.log(`Updated top-level category: ${parentCategory.categoryName}`);
      } else {
          console.log(`Found top-level category (no changes): ${parentCategory.categoryName}`);
      }
    }

    // Proses sub-kategori jika ada
    if (catData.children && catData.children.length > 0) {
      for (const subCatData of catData.children) {
        let subCategory = await prisma.category.findFirst({
          where: {
            categoryName: subCatData.name,
            categoryType: subCatData.type,
            userId: null, // Sub-kategori global
            parentCategoryId: parentCategory.id, // Terhubung ke parent yang baru dibuat/ditemukan
          },
        });

        if (!subCategory) {
          subCategory = await prisma.category.create({
            data: {
              categoryName: subCatData.name,
              categoryType: subCatData.type,
              userId: null,
              parentCategoryId: parentCategory.id,
              icon: subCatData.icon,
              color: subCatData.color,
            },
          });
          console.log(`  Created sub-category: ${subCategory.categoryName} under ${parentCategory.categoryName}`);
        } else {
            if(subCategory.icon !== subCatData.icon || subCategory.color !== subCatData.color) {
                subCategory = await prisma.category.update({
                    where: { id: subCategory.id },
                    data: { icon: subCatData.icon, color: subCatData.color }
                });
                console.log(`  Updated sub-category: ${subCategory.categoryName} under ${parentCategory.categoryName}`);
            } else {
                 console.log(`  Found sub-category (no changes): ${subCategory.categoryName} under ${parentCategory.categoryName}`);
            }
        }
      }
    }
  }
  console.log(`Seeding finished.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });