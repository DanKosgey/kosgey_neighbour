import { db } from '../database';
import { shops, products } from '../database/schema';
import { eq, desc } from 'drizzle-orm';

export class ShopService {
    // === SHOP METHODS ===

    async createShop(name: string, description: string, emoji: string, type: string = 'shop') {
        const result = await db.insert(shops).values({
            name,
            description,
            emoji,
            type
        }).returning();
        return result[0];
    }

    async getAllShops() {
        const allShops = await db.select().from(shops).orderBy(desc(shops.createdAt));

        // Fetch products for each shop to get counts/values
        // This could be optimized with a join, but for simplicity/clarity we'll map
        const shopsWithDetails = await Promise.all(allShops.map(async (shop) => {
            const shopProducts = await db.select().from(products).where(eq(products.shopId, shop.id));
            return {
                ...shop,
                products: shopProducts
            };
        }));

        return shopsWithDetails;
    }

    async getShopById(id: number) {
        const shop = await db.select().from(shops).where(eq(shops.id, id)).then(rows => rows[0]);
        if (!shop) return null;

        const shopProducts = await db.select().from(products).where(eq(products.shopId, id));
        return {
            ...shop,
            products: shopProducts
        };
    }

    async deleteShop(id: number) {
        // Products cascade delete due to foreign key, but good to be explicit or let DB handle
        // Defined onDelete: 'cascade' in schema, so just deleting shop is enough.
        return await db.delete(shops).where(eq(shops.id, id));
    }

    // === PRODUCT METHODS ===

    async addProduct(shopId: number, data: { name: string, description: string, price: number, stock: number, imageUrl?: string, imageUrls?: string[] }) {
        const imageUrl = data.imageUrl ?? (data.imageUrls && data.imageUrls[0]) ?? null;
        const imageUrls = data.imageUrls && data.imageUrls.length > 0 ? data.imageUrls : null;
        const result = await db.insert(products).values({
            shopId,
            name: data.name,
            description: data.description,
            price: data.price,
            stock: data.stock,
            imageUrl,
            imageUrls
        }).returning();
        return result[0];
    }

    async deleteProduct(id: number) {
        return await db.delete(products).where(eq(products.id, id));
    }
}

export const shopService = new ShopService();
