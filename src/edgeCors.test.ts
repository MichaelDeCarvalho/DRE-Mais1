import {describe,it,expect} from 'vitest';
import {corsHeadersForOrigin} from '../supabase/functions/_shared/cors';

describe('CORS fechado para o Worker DRE homologação',()=>{
  it('aceita o domínio de produção existente da homologação',()=>{
    const origin='https://dre-mais1-homologacao.corsys1.workers.dev';
    expect(corsHeadersForOrigin(origin)['access-control-allow-origin']).toBe(origin);
  });
  it('aceita apenas prévias desse mesmo Worker na conta corsys1',()=>{
    const origin='https://feat-saas-import-transaction-20261101-dre-mais1-homologacao.corsys1.workers.dev';
    expect(corsHeadersForOrigin(origin)['access-control-allow-origin']).toBe(origin);
  });
  it.each([
    'https://attacker.example',
    'https://dre-mais1-homologacao.corsys1.workers.dev.attacker.com',
    'https://unrelated.corsys1.workers.dev',
    'https://preview-otherworker.corsys1.workers.dev',
    'http://preview-dre-mais1-homologacao.corsys1.workers.dev',
    'https://PREVIEW-dre-mais1-homologacao.corsys1.workers.dev'
  ])('não reflete uma origem indevida: %s',(origin)=>{
    expect(corsHeadersForOrigin(origin)['access-control-allow-origin']).toBeUndefined();
  });
  it('preserva Vary: Origin e não reflete Origin ausente',()=>{
    expect(corsHeadersForOrigin(null)).toMatchObject({vary:'Origin'});
    expect(corsHeadersForOrigin(null)['access-control-allow-origin']).toBeUndefined();
  });
});
