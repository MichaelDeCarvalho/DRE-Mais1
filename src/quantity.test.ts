import { describe, expect, it } from 'vitest';
import { parseQuantityMilliBase } from './quantity';
describe('quantidades de receitas em G, ML e UN',()=>{
  it('mantem precisao de ate tres decimais',()=>{
    expect(parseQuantityMilliBase('11,5')).toBe(11500);
    expect(parseQuantityMilliBase('0,250')).toBe(250);
    expect(parseQuantityMilliBase('150')).toBe(150000);
    expect(parseQuantityMilliBase('0,001')).toBe(1);
    expect(parseQuantityMilliBase(' 12,345 ')).toBe(12345);
  });
  it('bloqueia valores ambiguos ou invalidos sem arredondamento',()=>{
    for(const value of ['0','0,000','-1','1.000','11.5','1,1234','NaN','1,','1 000','9007199254741']){
      expect(()=>parseQuantityMilliBase(value),value).toThrow();
    }
  });
});
