import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const formulaPrefix = /^[=+\-@\t\r]/;
  const safe = formulaPrefix.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ExportTablePayload {
  title: string;
  subtitle?: string;
  filenameBase: string;
  headers: string[];
  rows: Array<Array<string | number>>;
  summaryRows?: Array<[string, string | number]>;
}

export function exportToCsv(payload: ExportTablePayload): void {
  const lines: string[] = [];
  lines.push(payload.headers.map(sanitizeCsvCell).join(','));
  for (const row of payload.rows) {
    lines.push(row.map(sanitizeCsvCell).join(','));
  }
  if (payload.summaryRows && payload.summaryRows.length > 0) {
    lines.push('');
    for (const [label, val] of payload.summaryRows) {
      lines.push(`${sanitizeCsvCell(label)},${sanitizeCsvCell(val)}`);
    }
  }
  const csvContent = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, `${payload.filenameBase}.csv`);
}

export async function exportToExcel(payload: ExportTablePayload): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'MessLedger';
  wb.created = new Date();

  const sheet = wb.addWorksheet('Report', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  const titleRow = sheet.addRow([payload.title]);
  titleRow.font = { bold: true, size: 14 };
  if (payload.subtitle) {
    const subRow = sheet.addRow([payload.subtitle]);
    subRow.font = { size: 10, color: { argb: 'FF475569' } };
  } else {
    sheet.addRow([]);
  }
  sheet.addRow([]);

  const headerRow = sheet.addRow(payload.headers);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  for (const row of payload.rows) {
    sheet.addRow(row);
  }

  if (payload.summaryRows && payload.summaryRows.length > 0) {
    sheet.addRow([]);
    for (const [label, val] of payload.summaryRows) {
      const r = sheet.addRow([label, val]);
      r.font = { bold: true };
    }
  }

  sheet.columns.forEach((col, idx) => {
    let maxLen = (payload.headers[idx] || '').length + 4;
    for (const r of payload.rows) {
      const cellStr = String(r[idx] ?? '');
      if (cellStr.length + 3 > maxLen) maxLen = cellStr.length + 3;
    }
    col.width = Math.min(Math.max(maxLen, 12), 40);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, `${payload.filenameBase}.xlsx`);
}

export function exportToPdf(payload: ExportTablePayload): void {
  const doc = new jsPDF({ orientation: payload.headers.length > 6 ? 'landscape' : 'portrait' });

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(payload.title, 14, 16);

  if (payload.subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(payload.subtitle, 14, 22);
  }

  autoTable(doc, {
    startY: payload.subtitle ? 27 : 22,
    head: [payload.headers],
    body: payload.rows.map((r) => r.map((c) => String(c ?? ''))),
    styles: {
      fontSize: 8.5,
      cellPadding: 3,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  if (payload.summaryRows && payload.summaryRows.length > 0) {
    const finalY =
      (doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 40;
    autoTable(doc, {
      startY: finalY + 8,
      body: payload.summaryRows.map(([k, v]) => [k, String(v)]),
      styles: { fontSize: 9, fontStyle: 'bold' },
      theme: 'grid',
      tableWidth: 110,
    });
  }

  doc.save(`${payload.filenameBase}.pdf`);
}
