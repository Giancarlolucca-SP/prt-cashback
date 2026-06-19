export const DOCUMENT_CHECKLIST_STATUSES = [
  "PENDING",
  "REQUESTED",
  "RECEIVED",
  "CHECKED",
  "ATTACHED",
  "REJECTED",
  "WAIVED",
  "EXPIRED",
] as const;

export type DocumentChecklistStatus = (typeof DOCUMENT_CHECKLIST_STATUSES)[number];

export const DOCUMENT_CHECKLIST_DONE_STATUSES: ReadonlySet<DocumentChecklistStatus> = new Set(["CHECKED", "WAIVED"]);

export type BuyerDocumentChecklistInput = {
  buyerType: "PERSON" | "COMPANY";
  financingType?: string | null;
  hasFinancing?: boolean | null;
};

export type BuyerDocumentChecklistItem = {
  itemKey: string;
  label: string;
  isRequired: boolean;
  metadata: Record<string, unknown>;
};

const ADDRESS_PROOF_MAX_AGE_DAYS = 92;

function baseItem(itemKey: string, label: string, isRequired = true, metadata: Record<string, unknown> = {}): BuyerDocumentChecklistItem {
  return {
    itemKey,
    label,
    isRequired,
    metadata,
  };
}

export function buildBuyerDocumentChecklistItems(input: BuyerDocumentChecklistInput): BuyerDocumentChecklistItem[] {
  const items: BuyerDocumentChecklistItem[] = [
    baseItem("buyer_document_delivered", "Documentos do comprador entregues", true, { category: "gate", source: "s2_us06" }),
    baseItem("buyer_document_checked", "Documentos do comprador conferidos", true, { category: "gate", source: "s2_us06" }),
  ];

  if (input.buyerType === "COMPANY") {
    items.push(
      baseItem("representative_identity_document", "RG ou CNH do representante", true, { category: "identity" }),
      baseItem("representative_cpf_document", "CPF do representante", false, { category: "identity", conditional: "quando nao constar no documento" }),
      baseItem("company_cnpj_document", "Cartao CNPJ ou cadastro equivalente", true, { category: "company" }),
      baseItem("company_authority_document", "Contrato social ou comprovacao de poderes", true, { category: "company" }),
      baseItem("company_address_proof", "Comprovante de endereco da empresa/representante", true, {
        category: "address",
        maxAgeDays: ADDRESS_PROOF_MAX_AGE_DAYS,
      }),
    );
  } else {
    items.push(
      baseItem("person_identity_document", "RG ou CNH do comprador", true, { category: "identity" }),
      baseItem("person_cpf_document", "CPF do comprador", false, { category: "identity", conditional: "quando nao constar no documento" }),
      baseItem("person_address_proof", "Comprovante de residencia atualizado", true, {
        category: "address",
        maxAgeDays: ADDRESS_PROOF_MAX_AGE_DAYS,
      }),
    );
  }

  if (input.hasFinancing && input.financingType === "STORE_PARTNER") {
    items.push(
      baseItem("income_proof_payslip", "Holerite atualizado", false, { category: "income", financingType: "STORE_PARTNER" }),
      baseItem("income_proof_tax_return", "Declaracao de imposto de renda", false, { category: "income", financingType: "STORE_PARTNER" }),
      baseItem("income_proof_bank_statement", "Extrato bancario atualizado", false, { category: "income", financingType: "STORE_PARTNER" }),
    );
  }

  if (input.financingType === "CUSTOMER_OWN") {
    items.push(
      baseItem("own_financing_receipt_attention", "Alerta: valor da financeira propria deve cair na conta da loja", false, {
        category: "payment_alert",
        financingType: "CUSTOMER_OWN",
      }),
    );
  }

  return items;
}

export function isDocumentChecklistDone(status: DocumentChecklistStatus): boolean {
  return DOCUMENT_CHECKLIST_DONE_STATUSES.has(status);
}

export function isAddressProofItem(itemKey: string, metadata: unknown) {
  if (itemKey.includes("address_proof")) {
    return true;
  }
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && (metadata as Record<string, unknown>).category === "address");
}

export function isAddressProofExpired(issueDate: Date | null | undefined, referenceDate = new Date()) {
  if (!issueDate) {
    return false;
  }
  const ageMs = referenceDate.getTime() - issueDate.getTime();
  return ageMs > ADDRESS_PROOF_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}
