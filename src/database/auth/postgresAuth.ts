import { proto, BufferJSON, initAuthCreds, AuthenticationCreds, AuthenticationState, SignalDataTypeMap } from '@whiskeysockets/baileys';
import { db, withRetry } from '../../database';
import { authCredentials } from '../../database/schema';
import { eq, sql } from 'drizzle-orm';

export const usePostgresAuthState = async (collectionName: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> => {
    const writeData = async (data: any, id: string) => {
        const key = `${collectionName}:${id}`;
        const value = JSON.stringify(data, BufferJSON.replacer);

        // Use withRetry for resilience, but with fewer attempts to fail faster
        await withRetry(async () => {
            // Use PostgreSQL UPSERT (INSERT ... ON CONFLICT) for efficiency
            await db.insert(authCredentials)
                .values({ key, value })
                .onConflictDoUpdate({
                    target: authCredentials.key,
                    set: { value }
                });
        }, 2, 1000); // 2 retries with 1s initial delay
    };

    const readData = async (id: string) => {
        try {
            const key = `${collectionName}:${id}`;
            const result = await db.select().from(authCredentials).where(eq(authCredentials.key, key));

            if (result.length > 0) {
                return JSON.parse(result[0].value, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`Error reading auth data for ${id}:`, error);
            return null;
        }
    };

    const removeData = async (id: string) => {
        try {
            const key = `${collectionName}:${id}`;
            await db.delete(authCredentials).where(eq(authCredentials.key, key));
        } catch (error) {
            console.error(`Error removing auth data for ${id}:`, error);
        }
    };

    const creds: AuthenticationCreds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            const value = await readData(`${type}:${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value) as any;
                            } else if (value) {
                                data[id] = value;
                            }
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks: (() => Promise<void>)[] = [];

                    for (const category in data) {
                        const categoryKey = category as keyof SignalDataTypeMap;
                        const categoryData = data[categoryKey];

                        if (!categoryData) continue;

                        for (const id in categoryData) {
                            const value = categoryData[id];
                            if (value) {
                                tasks.push(() => writeData(value, `${category}:${id}`));
                            } else {
                                tasks.push(() => removeData(`${category}:${id}`));
                            }
                        }
                    }

                    // Execute in larger chunks with bulk UPSERT for better performance
                    const CHUNK_SIZE = 10; // Increased from 5
                    for (let i = 0; i < tasks.length; i += CHUNK_SIZE) {
                        const chunk = tasks.slice(i, i + CHUNK_SIZE);
                        try {
                            await Promise.all(chunk.map(task => task()));
                        } catch (error: any) {
                            console.error(`⚠️ Batch write failed (chunk ${Math.floor(i / CHUNK_SIZE) + 1}):`, error.message);
                            // Continue with next chunk instead of failing completely
                        }
                    }
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};
