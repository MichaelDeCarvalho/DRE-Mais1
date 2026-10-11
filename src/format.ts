export function brl(cents: number): string {
  if (!Number.isSafeInteger(cents)) throw new Error('Valor em centavos inválido');
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
export function periodLabel(period: string): string {
  const parts = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!parts) return 'Período inválido';
  const [_, year, month] = parts;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
