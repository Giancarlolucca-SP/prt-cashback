// Pure (DB-free) builder + renderer for the technical delivery document.
// Auto-fills the data already known by the system and produces a self-contained,
// print-ready HTML document with an item-by-item checklist for manual marking
// together with the customer. The browser prints this to paper or to PDF
// ("PDF pronto para impressao manual") without any server-side PDF dependency.

export type TechnicalDeliveryChecklistItem = {
  key: string;
  label: string;
};

export type TechnicalDeliveryDocumentInput = {
  documentId: string;
  generatedAt: Date;
  store: { name: string; legalName?: string | null; cnpj?: string | null };
  customer: { name: string; document?: string | null; phone?: string | null; email?: string | null };
  vehicle: {
    brand: string;
    model: string;
    version?: string | null;
    yearModel?: number | null;
    yearBuild?: number | null;
    plate?: string | null;
    vin?: string | null;
    color?: string | null;
  };
  seller?: { name: string } | null;
  responsible?: { name: string } | null;
  scheduledBy?: { name: string } | null;
  sale: { id: string; status: string };
  scheduledAt: Date;
  status: string;
  checklist: TechnicalDeliveryChecklistItem[];
};

export type TechnicalDeliveryDocument = {
  documentId: string;
  documentNumber: string;
  generatedAt: string;
  store: { name: string; legalName: string | null; cnpj: string | null };
  customer: { name: string; document: string | null; phone: string | null; email: string | null };
  vehicle: {
    brand: string;
    model: string;
    version: string | null;
    yearModel: number | null;
    yearBuild: number | null;
    plate: string | null;
    vin: string | null;
    color: string | null;
  };
  seller: { name: string } | null;
  responsible: { name: string } | null;
  scheduledBy: { name: string } | null;
  sale: { id: string; status: string };
  scheduledAt: string;
  status: string;
  checklist: TechnicalDeliveryChecklistItem[];
};

const PLACEHOLDER = "—";

function nullable<T>(value: T | null | undefined): T | null {
  return value ?? null;
}

function text(value: string | null | undefined): string {
  const trimmed = (value ?? "").toString().trim();
  return trimmed.length > 0 ? trimmed : PLACEHOLDER;
}

export function escapeHtml(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Human-friendly, stable identifier for auditing the printed copy.
export function technicalDeliveryDocumentNumber(documentId: string): string {
  const compact = documentId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return `ET-${compact.slice(0, 10) || "DOCUMENTO"}`;
}

function formatDateTime(value: Date): string {
  // Stable, locale-independent representation (dd/mm/yyyy hh:mm) so the rendered
  // document is deterministic regardless of server locale.
  const iso = value.toISOString();
  const [date, time] = iso.split("T");
  const [year, month, day] = date.split("-");
  const hhmm = (time ?? "").slice(0, 5);
  return `${day}/${month}/${year} ${hhmm}`;
}

function formatVehicleYear(yearModel: number | null, yearBuild: number | null): string {
  if (yearModel && yearBuild) {
    return yearModel === yearBuild ? String(yearModel) : `${yearBuild}/${yearModel}`;
  }
  return text(yearModel ? String(yearModel) : yearBuild ? String(yearBuild) : null);
}

export function buildTechnicalDeliveryDocument(input: TechnicalDeliveryDocumentInput): TechnicalDeliveryDocument {
  return {
    documentId: input.documentId,
    documentNumber: technicalDeliveryDocumentNumber(input.documentId),
    generatedAt: input.generatedAt.toISOString(),
    store: {
      name: input.store.name,
      legalName: nullable(input.store.legalName),
      cnpj: nullable(input.store.cnpj),
    },
    customer: {
      name: input.customer.name,
      document: nullable(input.customer.document),
      phone: nullable(input.customer.phone),
      email: nullable(input.customer.email),
    },
    vehicle: {
      brand: input.vehicle.brand,
      model: input.vehicle.model,
      version: nullable(input.vehicle.version),
      yearModel: nullable(input.vehicle.yearModel),
      yearBuild: nullable(input.vehicle.yearBuild),
      plate: nullable(input.vehicle.plate),
      vin: nullable(input.vehicle.vin),
      color: nullable(input.vehicle.color),
    },
    seller: input.seller ? { name: input.seller.name } : null,
    responsible: input.responsible ? { name: input.responsible.name } : null,
    scheduledBy: input.scheduledBy ? { name: input.scheduledBy.name } : null,
    sale: { id: input.sale.id, status: input.sale.status },
    scheduledAt: input.scheduledAt.toISOString(),
    status: input.status,
    checklist: input.checklist.map((item) => ({ key: item.key, label: item.label })),
  };
}

function infoRow(label: string, value: string): string {
  return `<div class="field"><span class="field-label">${escapeHtml(label)}</span><span class="field-value">${escapeHtml(value)}</span></div>`;
}

export function renderTechnicalDeliveryDocumentHtml(doc: TechnicalDeliveryDocument): string {
  const generatedAt = formatDateTime(new Date(doc.generatedAt));
  const scheduledAt = formatDateTime(new Date(doc.scheduledAt));
  const vehicleYear = formatVehicleYear(doc.vehicle.yearModel, doc.vehicle.yearBuild);

  const checklistRows = doc.checklist
    .map(
      (item) => `
        <tr>
          <td class="item">${escapeHtml(item.label)}</td>
          <td class="mark">(&nbsp;&nbsp;) OK</td>
          <td class="mark">(&nbsp;&nbsp;) N/A</td>
          <td class="obs"></td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Entrega Tecnica ${escapeHtml(doc.documentNumber)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; font-size: 12px; }
  h1 { font-size: 18px; margin: 0; }
  h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
  .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; }
  .doc-meta { text-align: right; font-size: 11px; }
  .doc-number { font-weight: bold; font-size: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 24px; }
  .field { display: flex; gap: 6px; padding: 2px 0; }
  .field-label { font-weight: bold; min-width: 130px; }
  .field-value { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { border: 1px solid #999; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #f0f0f0; font-size: 11px; }
  td.mark { width: 70px; white-space: nowrap; text-align: center; }
  td.obs { width: 30%; }
  .notes-box { border: 1px solid #999; min-height: 70px; margin-top: 6px; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 48px; }
  .sign-line { border-top: 1px solid #111; padding-top: 4px; text-align: center; font-size: 11px; }
  .footer { margin-top: 24px; font-size: 10px; color: #555; }
  @media print {
    body { margin: 12mm; }
    h2 { page-break-after: avoid; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="doc-header">
    <div>
      <h1>Entrega Tecnica</h1>
      <div>${escapeHtml(doc.store.name)}</div>
      ${doc.store.cnpj ? `<div>CNPJ: ${escapeHtml(doc.store.cnpj)}</div>` : ""}
    </div>
    <div class="doc-meta">
      <div class="doc-number">${escapeHtml(doc.documentNumber)}</div>
      <div>Gerado em: ${escapeHtml(generatedAt)}</div>
      <div>ID: ${escapeHtml(doc.documentId)}</div>
    </div>
  </div>

  <h2>Dados da Entrega</h2>
  <div class="grid">
    ${infoRow("Loja/Unidade", text(doc.store.name))}
    ${infoRow("Status", text(doc.status))}
    ${infoRow("Cliente", text(doc.customer.name))}
    ${infoRow("Documento", text(doc.customer.document))}
    ${infoRow("Telefone", text(doc.customer.phone))}
    ${infoRow("E-mail", text(doc.customer.email))}
    ${infoRow("Vendedor responsavel", text(doc.seller?.name ?? null))}
    ${infoRow("Processo de venda", text(doc.sale.id))}
    ${infoRow("Data/horario", text(scheduledAt))}
    ${infoRow("Responsavel administrativo", text(doc.scheduledBy?.name ?? null))}
    ${infoRow("Responsavel pela entrega", text(doc.responsible?.name ?? null))}
  </div>

  <h2>Veiculo</h2>
  <div class="grid">
    ${infoRow("Marca", text(doc.vehicle.brand))}
    ${infoRow("Modelo", text(doc.vehicle.model))}
    ${infoRow("Versao", text(doc.vehicle.version))}
    ${infoRow("Ano", vehicleYear)}
    ${infoRow("Placa", text(doc.vehicle.plate))}
    ${infoRow("Chassi", text(doc.vehicle.vin))}
    ${infoRow("Cor", text(doc.vehicle.color))}
  </div>

  <h2>Checklist de Conferencia (marcar junto com o cliente)</h2>
  <table>
    <thead>
      <tr><th>Item</th><th>OK</th><th>N/A</th><th>Observacao</th></tr>
    </thead>
    <tbody>${checklistRows}
    </tbody>
  </table>

  <h2>Observacoes Gerais</h2>
  <div class="notes-box"></div>

  <div class="signatures">
    <div class="sign-line">Assinatura do cliente</div>
    <div class="sign-line">Responsavel da loja</div>
  </div>

  <div class="footer">
    Documento gerado automaticamente pelo sistema. Identificador unico para auditoria: ${escapeHtml(doc.documentId)} (${escapeHtml(doc.documentNumber)}).
    A marcacao dos itens, observacoes finais e assinaturas devem ser preenchidas a mao no momento da entrega.
  </div>
</body>
</html>`;
}
