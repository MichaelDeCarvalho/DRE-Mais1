/**
 * CORS de homologação: origem publicada + URLs de Preview do MESMO Worker.
 * CORS não é autorização: toda operação protegida exige JWT e RLS.
 */
const PRODUCTION_ORIGIN = 'https://dre-mais1-homologacao.corsys1.workers.dev';
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+-dre-mais1-homologacao\.corsys1\.workers\.dev$/;

export function corsHeadersForOrigin(origin: string | null): Record<string, string> {
  const approved=Boolean(
    origin && (origin===PRODUCTION_ORIGIN || PREVIEW_ORIGIN.test(origin))
  );
  return {
    ...(approved?{'access-control-allow-origin': origin!}:{}),
    'access-control-allow-headers':'authorization, apikey, x-client-info, content-type',
    'access-control-allow-methods':'POST, OPTIONS',
    'vary':'Origin'
  };
}
