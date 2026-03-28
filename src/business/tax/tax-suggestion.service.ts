import { Injectable } from '@nestjs/common';
import { Company, ContactType, TaxType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SuggestTaxDto } from './dto/suggest-tax.dto';

type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TaxSuggestion {
  taxConfigId: string;
  type: TaxType;
  name: string;
  rate: string;
  taxAmount: string;
  netAmount: string;
  confidence: Confidence;
  reason: string;
  source: 'SYSTEM_RULE' | 'CUSTOM_RULE';
}

// ── System-level rule definitions (hardcoded, apply to every company) ────────

interface SystemRule {
  taxType: TaxType;
  /** One or more contact types that trigger this rule (empty = any) */
  contactTypes: ContactType[];
  /** COA codes that trigger this rule (empty = any) */
  triggerCoaCodes: string[];
  /** Keywords in description that trigger this rule (case-insensitive) */
  keywords: string[];
  /** Minimum number of matching signals required for HIGH confidence */
  highConfidenceThreshold: number;
  /** Human-readable reason template */
  reasonHigh: string;
  reasonMedium: string;
}

const SYSTEM_RULES: SystemRule[] = [
  {
    taxType: TaxType.PPH_21,
    contactTypes: [ContactType.EMPLOYEE],
    triggerCoaCodes: ['5-002'],
    keywords: ['gaji', 'honorarium', 'upah', 'thr', 'bonus', 'salary', 'freelance'],
    highConfidenceThreshold: 2,
    reasonHigh:
      'Pembayaran kepada individu/karyawan — dikenakan PPh Pasal 21 (withholding atas penghasilan orang pribadi).',
    reasonMedium:
      'Terdeteksi kemungkinan pembayaran ke individu (keyword cocok). Konfirmasi apakah penerima adalah orang pribadi.',
  },
  {
    taxType: TaxType.PPH_22,
    contactTypes: [ContactType.VENDOR],
    triggerCoaCodes: [],
    keywords: ['impor', 'import', 'pengadaan', 'bumn', 'bendahara', 'pembelian barang'],
    highConfidenceThreshold: 2,
    reasonHigh:
      'Pembelian barang dari BUMN/importir/bendahara pemerintah — berpotensi dikenakan PPh Pasal 22.',
    reasonMedium:
      'Keyword menunjukkan transaksi impor atau pengadaan. Cek apakah termasuk objek PPh 22.',
  },
  {
    taxType: TaxType.PPH_23,
    contactTypes: [ContactType.VENDOR],
    triggerCoaCodes: ['5-001', '5-003'],
    keywords: [
      'jasa', 'konsultan', 'sewa', 'rental', 'royalti', 'bunga', 'dividen',
      'manajemen', 'teknik', 'desain', 'audit', 'notaris', 'akuntan',
    ],
    highConfidenceThreshold: 2,
    reasonHigh:
      'Pembayaran jasa/sewa/royalti ke badan usaha — dikenakan PPh Pasal 23 (2% jasa, 15% dividen/bunga/royalti).',
    reasonMedium:
      'Keyword cocok dengan kategori PPh 23. Pastikan penerima adalah badan (bukan orang pribadi).',
  },
  {
    taxType: TaxType.PPH_4_2,
    contactTypes: [],
    triggerCoaCodes: ['5-003'],
    keywords: [
      'sewa tanah', 'sewa gedung', 'sewa bangunan', 'sewa ruko', 'sewa kantor',
      'sewa kos', 'konstruksi', 'bangun', 'renovasi', 'bunga deposito', 'obligasi',
    ],
    highConfidenceThreshold: 2,
    reasonHigh:
      'Sewa tanah/bangunan atau jasa konstruksi — dikenakan PPh Pasal 4 Ayat 2 (pajak final).',
    reasonMedium:
      'Terdeteksi kemungkinan sewa properti atau konstruksi. Cek apakah termasuk objek PPh Final.',
  },
  {
    taxType: TaxType.PPH_15,
    contactTypes: [ContactType.VENDOR],
    triggerCoaCodes: [],
    keywords: [
      'pelayaran', 'pengiriman laut', 'kapal', 'charter', 'penerbangan',
      'freight', 'shipping', 'cargo laut',
    ],
    highConfidenceThreshold: 2,
    reasonHigh:
      'Pembayaran ke perusahaan pelayaran/penerbangan — dikenakan PPh Pasal 15.',
    reasonMedium:
      'Keyword menunjukkan jasa transportasi laut/udara. Konfirmasi jenis usaha penerima.',
  },
];

@Injectable()
export class TaxSuggestionService {
  constructor(private readonly prisma: PrismaService) {}

  async suggest(company: Company, dto: SuggestTaxDto): Promise<{
    suggestions: TaxSuggestion[];
    notes: string | null;
  }> {
    const { debitCoaId, creditCoaId, contactId, amount = 0, description = '' } = dto;

    // Load active TaxConfigs for the company (indexed by type for O(1) lookup)
    const taxConfigs = await this.prisma.taxConfig.findMany({
      where: { companyId: company.id, isActive: true },
    });
    if (taxConfigs.length === 0) {
      return { suggestions: [], notes: 'Tidak ada TaxConfig aktif. Tambahkan konfigurasi pajak terlebih dahulu.' };
    }

    // Fetch contact and debit/credit COA codes in parallel (only if IDs provided)
    const [contact, coaCodes, customRules] = await Promise.all([
      contactId
        ? this.prisma.contact.findFirst({ where: { id: contactId, companyId: company.id }, select: { type: true, name: true } })
        : Promise.resolve(null),
      (debitCoaId || creditCoaId)
        ? this.prisma.chartOfAccount.findMany({
            where: { id: { in: [debitCoaId, creditCoaId].filter(Boolean) as string[] }, companyId: company.id },
            select: { id: true, code: true },
          })
        : Promise.resolve([]),
      this.prisma.taxSuggestionRule.findMany({
        where: { companyId: company.id, isActive: true },
        include: { taxConfig: true },
        orderBy: { priority: 'desc' },
      }),
    ]);

    const coaCodeSet = new Set(coaCodes.map((c) => c.code));
    const coaIdSet = new Set([debitCoaId, creditCoaId].filter(Boolean) as string[]);
    const descLower = description.toLowerCase();
    const configMap = new Map(taxConfigs.map((c) => [c.type, c]));

    const suggestions: TaxSuggestion[] = [];
    const seenConfigIds = new Set<string>();

    // ── Evaluate system rules ────────────────────────────────────────────────
    for (const rule of SYSTEM_RULES) {
      const config = configMap.get(rule.taxType);
      if (!config) continue; // Company hasn't configured this tax type

      let signals = 0;

      if (rule.contactTypes.length > 0 && contact && rule.contactTypes.includes(contact.type)) signals++;
      if (rule.triggerCoaCodes.length > 0 && rule.triggerCoaCodes.some((c) => coaCodeSet.has(c))) signals++;
      const matchedKeyword = rule.keywords.find((kw) => descLower.includes(kw));
      if (matchedKeyword) signals++;

      if (signals === 0) continue;

      const confidence: Confidence = signals >= rule.highConfidenceThreshold ? 'HIGH' : signals === 1 ? 'MEDIUM' : 'LOW';
      const taxAmount = amount > 0 ? amount * (config.rate.toNumber() / 100) : 0;

      suggestions.push({
        taxConfigId: config.id,
        type: config.type,
        name: config.name,
        rate: config.rate.toFixed(4),
        taxAmount: taxAmount.toFixed(2),
        netAmount: (amount - taxAmount).toFixed(2),
        confidence,
        reason: confidence === 'HIGH' ? rule.reasonHigh : rule.reasonMedium,
        source: 'SYSTEM_RULE',
      });
      seenConfigIds.add(config.id);
    }

    // ── Evaluate custom rules ────────────────────────────────────────────────
    for (const rule of customRules) {
      if (seenConfigIds.has(rule.taxConfigId)) continue; // Already suggested by system rule
      if (!taxConfigs.find((c) => c.id === rule.taxConfigId)) continue;

      let signals = 0;

      if (rule.triggerCoaIds.length > 0 && rule.triggerCoaIds.some((id) => coaIdSet.has(id))) signals++;
      if (rule.triggerContactType && contact?.type === rule.triggerContactType) signals++;
      if (rule.triggerKeywords.length > 0 && rule.triggerKeywords.some((kw) => descLower.includes(kw.toLowerCase()))) signals++;
      if (rule.minAmount != null && amount < rule.minAmount.toNumber()) continue;

      if (signals === 0) continue;

      const confidence: Confidence = signals >= 2 ? 'HIGH' : 'MEDIUM';
      const taxAmount = amount > 0 ? amount * (rule.taxConfig.rate.toNumber() / 100) : 0;

      suggestions.push({
        taxConfigId: rule.taxConfigId,
        type: rule.taxConfig.type,
        name: rule.taxConfig.name,
        rate: rule.taxConfig.rate.toFixed(4),
        taxAmount: taxAmount.toFixed(2),
        netAmount: (amount - taxAmount).toFixed(2),
        confidence,
        reason: rule.note ?? `Custom rule cocok dengan transaksi ini.`,
        source: 'CUSTOM_RULE',
      });
    }

    // Sort: HIGH first, then by rate descending
    suggestions.sort((a, b) => {
      const confOrder: Record<Confidence, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      if (confOrder[a.confidence] !== confOrder[b.confidence]) {
        return confOrder[a.confidence] - confOrder[b.confidence];
      }
      return parseFloat(b.rate) - parseFloat(a.rate);
    });

    const notes = suggestions.length === 0
      ? 'Tidak ada saran pajak yang sesuai dengan konteks transaksi ini.'
      : null;

    return { suggestions, notes };
  }
}
