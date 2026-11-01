import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocked = vi.hoisted(() => ({
  getUser: vi.fn(),
  fromTable: vi.fn(),
  fromStorage: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  upload: vi.fn()
}));

vi.mock('../supabase/client', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { getUser: mocked.getUser },
    from: mocked.fromTable,
    storage: { from: mocked.fromStorage }
  }
}));

import { archiveObjectPath, sha256Hex, stageMonthlyReportFiles } from './reportArchives';

const storeId = 'a90a2118-6f5e-4dc2-8548-32de70ce3c20';
const periodId = 'a01f4767-6cc4-4eff-8170-0c23f6c77c4c';

function files() {
  return {
    products: new File(['example xlsx a'], 'produtos.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    payments: new File(['example xlsx b'], 'pagamentos.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getUser.mockResolvedValue({ data: { user: { id: 'user-a' } }, error: null });
  mocked.fromTable.mockReturnValue({ select: mocked.select });
  mocked.select.mockReturnValue({ eq: mocked.eq });
  mocked.eq.mockReturnValue({ eq: mocked.eq, single: mocked.single });
  mocked.single.mockResolvedValue({
    data: { id: periodId, store_id: storeId, status: 'DRAFT' }, error: null
  });
  mocked.fromStorage.mockReturnValue({ upload: mocked.upload });
  mocked.upload.mockResolvedValue({ error: null });
});

describe('arquivo original XLSX privado (não executa importação)', () => {
  it('constrói caminho determinístico por loja, competência, tipo e SHA', async () => {
    const bytes = new TextEncoder().encode('abc').buffer;
    expect(await sha256Hex(bytes)).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const path = archiveObjectPath(storeId, periodId, 'PRODUCTS', 'a'.repeat(64));
    expect(path).toBe(`${storeId}/${periodId}/PRODUCTS/${'a'.repeat(64)}.xlsx`);
    expect(() => archiveObjectPath(storeId, periodId, 'SALES' as 'PRODUCTS', 'a'.repeat(64))).toThrow();
  });

  it('não acessa o Storage com arquivo inválido ou extensão proibida', async () => {
    const { payments } = files();
    await expect(stageMonthlyReportFiles(storeId, periodId,
      new File(['bad'], 'invalid.xls'), payments
    )).rejects.toThrow('.xlsx');
    expect(mocked.getUser).not.toHaveBeenCalled();
    expect(mocked.fromStorage).not.toHaveBeenCalled();
  });

  it('não armazena arquivo quando não há sessão autenticada', async () => {
    mocked.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const { products, payments } = files();
    await expect(stageMonthlyReportFiles(storeId, periodId, products, payments))
      .rejects.toThrow('não autenticada');
    expect(mocked.fromStorage).not.toHaveBeenCalled();
  });

  it('não armazena arquivo para período inacessível ou fechado', async () => {
    mocked.single.mockResolvedValueOnce({
      data: { id: periodId, store_id: storeId, status: 'FECHADO' }, error: null
    });
    const { products, payments } = files();
    await expect(stageMonthlyReportFiles(storeId, periodId, products, payments))
      .rejects.toThrow('não está em rascunho');
    expect(mocked.fromStorage).not.toHaveBeenCalled();
  });

  it('armazena os dois arquivos sem overwrite ou escrita financeira e retorna status STAGED', async () => {
    const { products, payments } = files();
    const result = await stageMonthlyReportFiles(storeId, periodId, products, payments);
    expect(result.state).toBe('FILES_STAGED_NOT_IMPORTED');
    expect(result.files).toHaveLength(2);
    expect(result.files[0].kind).toBe('PRODUCTS');
    expect(result.files[1].kind).toBe('PAYMENTS');
    expect(mocked.fromStorage).toHaveBeenCalledWith('dre-mais1-report-archives');
    expect(mocked.upload).toHaveBeenCalledTimes(2);
    for (const call of mocked.upload.mock.calls) {
      expect(call[0]).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/(PRODUCTS|PAYMENTS)\/[a-f0-9]{64}\.xlsx$/);
      expect(call[2]).toMatchObject({ upsert: false });
    }
    expect(mocked.fromTable).toHaveBeenCalledTimes(1);
    expect(mocked.fromTable).toHaveBeenCalledWith('periods');
  });

  it('falha sem anunciar importação quando segundo upload é rejeitado', async () => {
    mocked.upload.mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: 'duplicado' } });
    const { products, payments } = files();
    await expect(stageMonthlyReportFiles(storeId, periodId, products, payments))
      .rejects.toThrow('nenhuma linha financeira foi importada');
    expect(mocked.upload).toHaveBeenCalledTimes(2);
  });
});
