// src/domain/quotation/price-resolution.ts — Resolve the effective unit
// price for a product given an optional price list.

import { db } from '@/lib/db';

export interface PriceResolution {
  unitPriceCents: number;
  source: 'PRICE_LIST_ITEM' | 'PRODUCT_LIST_PRICE';
}

/** Resolve the unit price for a product on a quote. */
export async function resolveUnitPrice(
  productId: string,
  priceListId?: string,
): Promise<PriceResolution> {
  if (priceListId) {
    const item = await db.priceListItem.findUnique({
      where: { priceListId_productId: { priceListId, productId } },
    });
    if (item && item.active) {
      return { unitPriceCents: item.unitPriceCents, source: 'PRICE_LIST_ITEM' };
    }
  }
  const product = await db.product.findUnique({ where: { id: productId } });
  if (!product) throw new Error('Product not found');
  return { unitPriceCents: product.listPriceCents, source: 'PRODUCT_LIST_PRICE' };
}
