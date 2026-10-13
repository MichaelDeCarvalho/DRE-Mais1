/** Converte quantidade de G, ML ou UN para milesimos inteiros sem ponto flutuante. */
export function parseQuantityMilliBase(input: string): number {
  const raw=input.trim();
  const match=/^(\d+)(?:,(\d{1,3}))?$/.exec(raw);
  if (!match) throw new Error('Informe consumo positivo com ate 3 casas decimais usando virgula (ex.: 11,5 ou 0,250).');
  const value=BigInt(match[1])*1000n+BigInt((match[2]||'').padEnd(3,'0'));
  if(value<1n||value>BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Quantidade consumida deve ser positiva e estar dentro do limite suportado.');
  }
  return Number(value);
}
