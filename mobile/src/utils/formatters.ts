// ── CPF ───────────────────────────────────────────────────────────────────────

export function stripCpf(cpf: string): string {
  return cpf.replace(/\D/g, '');
}

export function formatCpf(cpf: string): string {
  const s = stripCpf(cpf);
  return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function maskCpfInput(raw: string): string {
  const digits = stripCpf(raw).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function isValidCpf(cpf: string): boolean {
  const s = stripCpf(cpf);
  if (s.length !== 11 || /^(\d)\1+$/.test(s)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(s[i]) * (10 - i);
  let check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  if (check !== parseInt(s[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i]) * (11 - i);
  check = (sum * 10) % 11;
  if (check === 10 || check === 11) check = 0;
  return check === parseInt(s[10]);
}

// ── Currency ─────────────────────────────────────────────────────────────────

export function formatBRL(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Parse a BRL string like "R$ 10,50" or "10.50" into a number */
export function parseBRL(raw: string): number {
  const n = parseFloat(raw.replace(/[^\d,]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// ── Date ──────────────────────────────────────────────────────────────────────

export function formatDateBR(date: string | Date): string {
  return new Date(date).toLocaleDateString('pt-BR');
}

export function formatDateTimeBR(date: string | Date): string {
  return new Date(date).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Phone ─────────────────────────────────────────────────────────────────────

export function maskPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  return digits;
}

// ── Display masking ───────────────────────────────────────────────────────────

export function maskCpfDisplay(cpf: string): string {
  const digits = stripCpf(cpf);
  if (digits.length !== 11) return cpf;
  return `${digits.slice(0, 3)}.XXX.XXX-${digits.slice(9)}`;
}

export function maskName(name: string): string {
  if (!name) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

// ── CNPJ ─────────────────────────────────────────────────────────────────────

export function maskCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}
