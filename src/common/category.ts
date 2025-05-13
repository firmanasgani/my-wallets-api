// src/categories/default-categories.ts
import { CategoryType } from '@prisma/client'; // Impor enum dari Prisma

// Tipe ini hanya untuk struktur data template, tidak perlu ID atau userId
interface DefaultCategoryTemplate {
  categoryName: string;
  categoryType: CategoryType;
  icon?: string;
  color?: string;
  subCategories?: Omit<DefaultCategoryTemplate, 'subCategories'>[]; // Sub-kategori tidak boleh punya sub-kategori lagi di template ini (untuk 1 level)
}

export const defaultCategoryTemplates: DefaultCategoryTemplate[] = [
  // --- INCOME CATEGORIES ---
  { categoryName: 'Gaji', categoryType: CategoryType.INCOME, icon: 'briefcase', color: '#4CAF50' },
  { categoryName: 'Bonus', categoryType: CategoryType.INCOME, icon: 'gift', color: '#8BC34A' },
  { categoryName: 'Pendapatan Usaha', categoryType: CategoryType.INCOME, icon: 'store', color: '#CDDC39' },
  { categoryName: 'Investasi', categoryType: CategoryType.INCOME, icon: 'chart-line', color: '#00BCD4' },
  { categoryName: 'Hadiah Diterima', categoryType: CategoryType.INCOME, icon: 'hand-holding-usd', color: '#009688' },
  { categoryName: 'Freelance', categoryType: CategoryType.INCOME, icon: 'laptop-code', color: '#3F51B5' },
  { categoryName: 'Lainnya (Pemasukan)', categoryType: CategoryType.INCOME, icon: 'ellipsis-h', color: '#795548' },

  // --- EXPENSE CATEGORIES ---
  {
    categoryName: 'Makanan & Minuman', categoryType: CategoryType.EXPENSE, icon: 'utensils', color: '#FF9800',
    subCategories: [
      { categoryName: 'Belanja Bahan', categoryType: CategoryType.EXPENSE, icon: 'shopping-basket', color: '#FFC107' },
      { categoryName: 'Makan di Luar', categoryType: CategoryType.EXPENSE, icon: 'glass-cheers', color: '#FFA726' }, // Mengganti ikon agar beda
      { categoryName: 'Kopi & Minuman', categoryType: CategoryType.EXPENSE, icon: 'coffee', color: '#FFB74D' },
    ],
  },
  {
    categoryName: 'Transportasi', categoryType: CategoryType.EXPENSE, icon: 'car-side', color: '#2196F3',
    subCategories: [
      { categoryName: 'Bahan Bakar', categoryType: CategoryType.EXPENSE, icon: 'gas-pump', color: '#64B5F6' },
      { categoryName: 'Transportasi Umum', categoryType: CategoryType.EXPENSE, icon: 'bus-alt', color: '#90CAF9' },
      { categoryName: 'Parkir & Tol', categoryType: CategoryType.EXPENSE, icon: 'parking', color: '#42A5F5' },
    ],
  },
  {
    categoryName: 'Tempat Tinggal', categoryType: CategoryType.EXPENSE, icon: 'home', color: '#F44336',
    subCategories: [
      { categoryName: 'Sewa / Cicilan KPR', categoryType: CategoryType.EXPENSE, icon: 'file-invoice-dollar', color: '#E57373' },
      { categoryName: 'Tagihan Utilitas', categoryType: CategoryType.EXPENSE, icon: 'bolt', color: '#EF5350' },
      { categoryName: 'Internet & TV Kabel', categoryType: CategoryType.EXPENSE, icon: 'wifi', color: '#F06292' },
    ],
  },
  { categoryName: 'Kebutuhan Pribadi', categoryType: CategoryType.EXPENSE, icon: 'user-tie', color: '#9C27B0' },
  { categoryName: 'Kesehatan', categoryType: CategoryType.EXPENSE, icon: 'heartbeat', color: '#E91E63' },
  { categoryName: 'Pendidikan', categoryType: CategoryType.EXPENSE, icon: 'graduation-cap', color: '#673AB7' },
  { categoryName: 'Hiburan', categoryType: CategoryType.EXPENSE, icon: 'film', color: '#3F51B5' },
  { categoryName: 'Tagihan Lainnya', categoryType: CategoryType.EXPENSE, icon: 'file-invoice', color: '#03A9F4' },
  { categoryName: 'Anak-anak', categoryType: CategoryType.EXPENSE, icon: 'child', color: '#FFEB3B' },
  { categoryName: 'Hadiah & Donasi', categoryType: CategoryType.EXPENSE, icon: 'hand-holding-heart', color: '#795548' },
  { categoryName: 'Pajak', categoryType: CategoryType.EXPENSE, icon: 'balance-scale', color: '#607D8B' },
  { categoryName: 'Lainnya (Pengeluaran)', categoryType: CategoryType.EXPENSE, icon: 'ellipsis-h', color: '#9E9E9E' },
];