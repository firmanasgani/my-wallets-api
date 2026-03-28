import { InvoiceStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface InvoiceEmailItem {
  description: string;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  total: Prisma.Decimal;
}

export interface InvoiceEmailData {
  // Company
  companyName: string;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;

  // Invoice
  invoiceNumber: string;
  status: InvoiceStatus;
  issueDate: Date;
  dueDate: Date;
  clientName: string;
  clientEmail: string | null;
  clientAddress: string | null;
  subtotal: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  amountPaid: Prisma.Decimal;
  notes: string | null;

  // Items
  items: InvoiceEmailItem[];

  // Bank account (optional)
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountHolder: string | null;

  // PPN dari company default
  companyTaxEnabled: boolean;
  companyTaxRate: string;

  // Withholding tax dari taxConfig (PPh, dll) — opsional
  withholdingTaxAmount: Prisma.Decimal;
  taxConfigName: string | null;
  taxConfigType: string | null;
  taxConfigRate: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(value: Prisma.Decimal | number): string {
  return `Rp ${Number(value).toLocaleString('id-ID')}`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: InvoiceStatus): string {
  const map: Record<InvoiceStatus, string> = {
    DRAFT: 'DRAFT',
    SENT: 'TERKIRIM',
    PAID: 'LUNAS',
    OVERDUE: 'TERLAMBAT',
  };
  return map[status];
}

function statusBgColor(status: InvoiceStatus): string {
  const map: Record<InvoiceStatus, string> = {
    DRAFT: '#94a3b8',
    SENT: '#3b82f6',
    PAID: '#10b981',
    OVERDUE: '#ef4444',
  };
  return map[status];
}

function buildItemRows(items: InvoiceEmailItem[]): string {
  return items
    .map((item) => {
      const hasDiscount = item.discountAmount.gt(0);
      const hasTax = item.taxRate.gt(0);
      return `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;">${item.description}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;text-align:right;white-space:nowrap;">${Number(item.quantity)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;text-align:right;white-space:nowrap;">${formatRupiah(item.unitPrice)}</td>
          <td class="items-col-discount" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#dc2626;text-align:right;white-space:nowrap;">${hasDiscount ? `-${formatRupiah(item.discountAmount)}` : '-'}</td>
          <td class="items-col-tax" style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#059669;text-align:center;white-space:nowrap;">${hasTax ? `${Number(item.taxRate)}%` : '-'}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#1e293b;text-align:right;font-weight:600;white-space:nowrap;">${formatRupiah(item.total)}</td>
        </tr>`;
    })
    .join('');
}

function buildBankSection(
  bankName: string | null,
  bankAccountNumber: string | null,
  bankAccountHolder: string | null,
): string {
  if (!bankName && !bankAccountNumber) return '';
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef2ff;border-radius:8px;border:1px solid #e0e7ff;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 8px;font-size:10px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.8px;">Rekening Tujuan Transfer</p>
          <p style="margin:0;font-size:14px;font-weight:700;color:#1e293b;">${bankName ?? ''}</p>
          <p style="margin:4px 0 0;font-size:14px;font-weight:600;color:#0f172a;letter-spacing:0.5px;font-family:'Courier New',Courier,monospace;">${bankAccountNumber ?? ''}</p>
          <p style="margin:4px 0 0;font-size:11px;color:#64748b;">a/n ${bankAccountHolder ?? ''}</p>
        </td>
      </tr>
    </table>`;
}

function buildNotesSection(notes: string | null): string {
  if (!notes) return '';
  return `
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;">
      <tr>
        <td>
          <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Catatan</p>
          <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">${notes}</p>
        </td>
      </tr>
    </table>`;
}

function buildPartialPaymentRows(
  totalAmount: Prisma.Decimal,
  amountPaid: Prisma.Decimal,
): string {
  if (amountPaid.lte(0)) return '';
  const remaining = totalAmount.sub(amountPaid);
  return `
    <tr>
      <td style="padding:6px 0 2px;font-size:12px;color:#f59e0b;">Sudah Dibayar</td>
      <td style="padding:6px 0 2px;font-size:12px;color:#f59e0b;text-align:right;font-family:'Courier New',Courier,monospace;">${formatRupiah(amountPaid)}</td>
    </tr>
    <tr>
      <td style="padding:2px 0;font-size:13px;font-weight:700;color:#dc2626;">Sisa Tagihan</td>
      <td style="padding:2px 0;font-size:13px;font-weight:700;color:#dc2626;text-align:right;font-family:'Courier New',Courier,monospace;">${formatRupiah(remaining)}</td>
    </tr>`;
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildInvoiceEmailHtml(data: InvoiceEmailData): string {
  const {
    companyName,
    companyAddress,
    invoiceNumber,
    status,
    issueDate,
    dueDate,
    clientName,
    clientEmail,
    clientAddress,
    subtotal,
    taxAmount,
    totalAmount,
    amountPaid,
    notes,
    items,
    bankName,
    bankAccountNumber,
    bankAccountHolder,
    companyTaxEnabled,
    companyTaxRate,
    withholdingTaxAmount,
    taxConfigName,
    taxConfigType,
    taxConfigRate,
  } = data;

  const showPpn = companyTaxEnabled && new Prisma.Decimal(taxAmount).gt(0);
  const ppnLabel = `PPN (${companyTaxRate}%)`;
  const showWithholding = taxConfigName !== null && new Prisma.Decimal(withholdingTaxAmount).gt(0);
  const withholdingLabel = taxConfigRate ? `${taxConfigName} (${taxConfigRate}%)` : (taxConfigName ?? '');

  const itemRows = buildItemRows(items);
  const bankSection = buildBankSection(bankName, bankAccountNumber, bankAccountHolder);
  const notesSection = buildNotesSection(notes);
  const partialPaymentRows = buildPartialPaymentRows(totalAmount, amountPaid);
  const printedAt = formatDateTime(new Date());

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Invoice ${invoiceNumber}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }

    @media only screen and (max-width: 600px) {
      .email-wrapper { width: 100% !important; }
      .email-container { width: 100% !important; border-radius: 0 !important; }
      .header-table td { display: block !important; width: 100% !important; text-align: center !important; }
      .header-logo-cell { margin-bottom: 8px !important; }
      .header-invoice-cell { text-align: center !important; }
      .two-col-left, .two-col-right { display: block !important; width: 100% !important; }
      .items-table th, .items-table td { padding: 8px 8px !important; font-size: 11px !important; }
      .items-col-discount, .items-col-tax { display: none !important; }
      .totals-table { width: 100% !important; }
      .footer-bank, .footer-notes { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">

<table class="email-wrapper" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <table class="email-container" role="presentation" border="0" cellpadding="0" cellspacing="0" width="620" style="background-color:#ffffff;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,0.07);overflow:hidden;">

        <!-- HEADER -->
        <tr>
          <td style="background-color:#4f46e5;padding:0;">
            <table class="header-table" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td class="header-logo-cell" valign="middle" style="padding:20px 28px;">
                  <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;line-height:1.2;">${companyName}</p>
                  ${companyAddress ? `<p style="margin:4px 0 0;font-size:11px;color:#c7d2fe;line-height:1.5;">${companyAddress}</p>` : ''}
                </td>
                <td class="header-invoice-cell" valign="middle" align="right" style="padding:20px 28px;">
                  <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:2px;line-height:1;">INVOICE</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#c7d2fe;letter-spacing:0.5px;">${invoiceNumber}</p>
                  <table role="presentation" border="0" cellpadding="0" cellspacing="0" align="right" style="margin-top:10px;">
                    <tr>
                      <td style="background-color:${statusBgColor(status)};border-radius:100px;padding:3px 12px;">
                        <span style="font-size:10px;font-weight:700;color:#ffffff;letter-spacing:1px;text-transform:uppercase;">${statusLabel(status)}</span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DATES ROW -->
        <tr>
          <td style="background-color:#eef2ff;padding:14px 28px;border-bottom:1px solid #e0e7ff;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="width:50%;">
                  <p style="margin:0;font-size:10px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.8px;">Tanggal Terbit</p>
                  <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#1e293b;">${formatDate(issueDate)}</p>
                </td>
                <td style="width:50%;">
                  <p style="margin:0;font-size:10px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:0.8px;">Jatuh Tempo</p>
                  <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#1e293b;">${formatDate(dueDate)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CLIENT INFO -->
        <tr>
          <td style="padding:20px 28px 0;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;">
              <tr>
                <td style="padding:16px 18px;">
                  <p style="margin:0 0 6px;font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Ditagihkan Kepada</p>
                  <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">${clientName}</p>
                  ${clientEmail ? `<p style="margin:3px 0 0;font-size:12px;color:#64748b;">${clientEmail}</p>` : ''}
                  ${clientAddress ? `<p style="margin:3px 0 0;font-size:12px;color:#64748b;">${clientAddress}</p>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ITEMS TABLE -->
        <tr>
          <td style="padding:20px 28px 0;">
            <table class="items-table" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;">
              <thead>
                <tr style="background-color:#4f46e5;">
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;">Deskripsi</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Qty</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Harga Satuan</th>
                  <th class="items-col-discount" style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Diskon</th>
                  <th class="items-col-tax" style="padding:10px 14px;text-align:center;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">PPN</th>
                  <th style="padding:10px 14px;text-align:right;font-size:11px;font-weight:700;color:#ffffff;letter-spacing:0.5px;text-transform:uppercase;white-space:nowrap;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${itemRows}
              </tbody>
            </table>
          </td>
        </tr>

        <!-- TOTALS + BANK ACCOUNT -->
        <tr>
          <td style="padding:16px 28px 0;">
            <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <!-- Left: Bank + Notes -->
                <td class="two-col-left" valign="top" style="width:50%;padding-right:16px;">
                  ${bankSection}
                  ${notesSection}
                </td>

                <!-- Right: Totals -->
                <td class="two-col-right" valign="top" style="width:50%;">
                  <table class="totals-table" role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
                    <tr>
                      <td style="padding:5px 0;font-size:13px;color:#64748b;">Subtotal</td>
                      <td style="padding:5px 0;font-size:13px;color:#334155;text-align:right;font-family:'Courier New',Courier,monospace;">${formatRupiah(subtotal)}</td>
                    </tr>
                    ${showPpn ? `
                    <tr>
                      <td style="padding:5px 0;font-size:13px;color:#64748b;">${ppnLabel}</td>
                      <td style="padding:5px 0;font-size:13px;color:#334155;text-align:right;font-family:'Courier New',Courier,monospace;">${formatRupiah(taxAmount)}</td>
                    </tr>` : ''}
                    ${showWithholding ? `
                    <tr>
                      <td style="padding:5px 0 2px;">
                        <span style="font-size:13px;color:#64748b;">${withholdingLabel}</span><br/>
                        <span style="display:inline-block;margin-top:2px;font-size:10px;color:#6366f1;background-color:#eef2ff;border:1px solid #c7d2fe;border-radius:4px;padding:1px 7px;">${taxConfigType ? taxConfigType.replace(/_/g, ' ') : ''} · ${taxConfigName}</span>
                      </td>
                      <td style="padding:5px 0;font-size:13px;color:#334155;text-align:right;vertical-align:top;font-family:'Courier New',Courier,monospace;">${formatRupiah(withholdingTaxAmount)}</td>
                    </tr>` : ''}
                    <tr>
                      <td colspan="2" style="padding:4px 0;">
                        <div style="height:1px;background-color:#e2e8f0;"></div>
                      </td>
                    </tr>
                    <tr>
                      <td colspan="2" style="padding:0;">
                        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef2ff;border-radius:8px;">
                          <tr>
                            <td style="padding:10px 14px;font-size:14px;font-weight:700;color:#4f46e5;">Total</td>
                            <td style="padding:10px 14px;font-size:14px;font-weight:700;color:#4f46e5;text-align:right;font-family:'Courier New',Courier,monospace;">${formatRupiah(totalAmount)}</td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    ${partialPaymentRows}
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="padding:24px 28px 0;">
            <div style="height:1px;background-color:#e2e8f0;"></div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="padding:16px 28px 24px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;line-height:1.6;">
              Invoice ini dibuat otomatis oleh <strong style="color:#6366f1;">MyWallets</strong>.<br />
              Dicetak pada ${printedAt}
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`;
}
