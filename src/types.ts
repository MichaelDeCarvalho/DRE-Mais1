export interface MethodTotal { code: string; label: string; totalCents: number }
export interface UnmappedProduct {
  externalCode: string;
  name: string;
  category: string;
  quantity: number;
  salesCents: number;
}
export interface ImportSummary {
  period: string;
  paymentReportPeriod: string;
  productsReportHasIndependentPeriod: boolean;
  productsTotalCents: number;
  paymentsTotalCents: number;
  differenceCents: number;
  reconciled: boolean;
  positiveSalesCents: number;
  adjustmentsCents: number;
  productRows: number;
  paymentRows: number;
  soldProductCodes: number;
  mappedProductCodes: number;
  unmappedProducts: UnmappedProduct[];
  paymentMethods: MethodTotal[];
  warnings: string[];
}

export interface CatalogImportSummary {
  filename: string;
  mappedCodesImported: number;
  skippedRows: number;
  warning: string;
}
export interface MappingOverview {
  soldProductCodes: number;
  mappedProductCodes: number;
  unmappedProducts: UnmappedProduct[];
}

export interface CatalogStatus {
  loaded: boolean;
  filename: string | null;
  validCodes: number;
  skippedRows: number;
}
