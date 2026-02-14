
import { BaseDocument } from '../types';

/**
 * Configuration interface for LocalDB.
 */
interface DBConfig {
    /** The name of the IndexedDB database. */
    dbName: string;
    /** The schema version number. Increment to trigger schema updates. */
    version: number;
    /** An array of object store (table) names to create. */
    stores: string[];
}

/**
 * Represents a single collection (Object Store) in the LocalDB.
 * Provides a MongoDB-like API for basic CRUD operations on IndexedDB.
 */
export class Collection<T extends BaseDocument> {
    private db: IDBDatabase;
    private name: string;

    /**
     * Initializes a new Collection instance.
     * @param {IDBDatabase} db - The raw IndexedDB connection.
     * @param {string} name - The name of the object store.
     */
    constructor(db: IDBDatabase, name: string) {
        this.db = db;
        this.name = name;
    }

    /**
     * Helper to get the IDBObjectStore for a transaction.
     */
    private getStore(mode: IDBTransactionMode): IDBObjectStore {
        const tx = this.db.transaction(this.name, mode);
        return tx.objectStore(this.name);
    }

    /**
     * Helper to convert IDBRequests into Promises.
     */
    private promisify<R>(request: IDBRequest<R> | IDBTransaction): Promise<R> {
        return new Promise((resolve, reject) => {
            // @ts-ignore - 'onsuccess' exists on IDBRequest
            if (request.onsuccess !== undefined) { 
                 // @ts-ignore
                request.onsuccess = () => resolve(request.result);
                // @ts-ignore
                request.onerror = () => reject(request.error);
            } else {
                // For transactions
                 // @ts-ignore
                request.oncomplete = () => resolve(undefined as R);
                 // @ts-ignore
                request.onerror = () => reject(request.error);
                // @ts-ignore
                request.onabort = () => reject(request.error);
            }
        });
    }

    /**
     * Finds documents matching a query.
     * 
     * @param {Partial<T> | ((item: T) => boolean)} [query={}] - An object with key-value pairs to match, or a predicate function.
     * @returns {Promise<T[]>} An array of documents that match the query.
     */
    async find(query: Partial<T> | ((item: T) => boolean) = {}): Promise<T[]> {
        const store = this.getStore('readonly');
        const request = store.getAll();
        const allItems = await this.promisify<T[]>(request);

        if (typeof query === 'function') {
            return allItems.filter(query);
        }

        const keys = Object.keys(query) as (keyof T)[];
        if (keys.length === 0) return allItems;

        return allItems.filter(item => {
            return keys.every(key => {
                // @ts-ignore
                return item[key] === query[key];
            });
        });
    }

    /**
     * Retrieves a single document by its ID.
     * 
     * @param {string} id - The unique ID of the document.
     * @returns {Promise<T | undefined>} The document found, or undefined if it doesn't exist.
     */
    async findOne(id: string): Promise<T | undefined> {
        const store = this.getStore('readonly');
        const request = store.get(id);
        return this.promisify<T>(request);
    }

    /**
     * Inserts a single document into the collection.
     * Automatically sets `createdAt` and `updatedAt` if they are not provided.
     * 
     * @param {T} doc - The document to insert.
     * @returns {Promise<T>} The inserted document with timestamps.
     */
    async insertOne(doc: T): Promise<T> {
        const store = this.getStore('readwrite');
        const now = Date.now();
        const newDoc = {
            ...doc,
            createdAt: doc.createdAt || now,
            updatedAt: now
        };
        const request = store.put(newDoc);
        await this.promisify(request);
        return newDoc;
    }

    /**
     * Inserts multiple documents in a single transaction for better performance.
     * 
     * @param {T[]} docs - Array of documents to insert.
     * @returns {Promise<void>} A promise that resolves when the transaction completes.
     */
    async insertMany(docs: T[]): Promise<void> {
        const tx = this.db.transaction(this.name, 'readwrite');
        const store = tx.objectStore(this.name);
        const now = Date.now();
        
        docs.forEach(doc => {
            store.put({
                ...doc,
                createdAt: doc.createdAt || now,
                updatedAt: now
            });
        });

        return this.promisify(tx);
    }

    /**
     * Updates an existing document.
     * 
     * @param {string} id - The ID of the document to update.
     * @param {Partial<T>} update - An object containing fields to modify.
     * @returns {Promise<void>}
     * @throws {Error} If the document with the given ID is not found.
     */
    async updateOne(id: string, update: Partial<T>): Promise<void> {
        const store = this.getStore('readwrite');
        const getReq = store.get(id);
        const doc = await this.promisify<T>(getReq);
        
        if (!doc) throw new Error(`Document with id ${id} not found`);

        const updatedDoc = {
            ...doc,
            ...update,
            updatedAt: Date.now()
        };

        const putReq = store.put(updatedDoc);
        await this.promisify(putReq);
    }

    /**
     * Deletes a document by its ID.
     * 
     * @param {string} id - The ID of the document to delete.
     * @returns {Promise<void>}
     */
    async deleteOne(id: string): Promise<void> {
        const store = this.getStore('readwrite');
        const request = store.delete(id);
        await this.promisify(request);
    }

    /**
     * Counts the total number of documents in the collection.
     * 
     * @returns {Promise<number>} The total count.
     */
    async count(): Promise<number> {
        const store = this.getStore('readonly');
        const request = store.count();
        return this.promisify<number>(request);
    }

    /**
     * Deletes all documents in the collection (Truncate).
     * 
     * @returns {Promise<void>}
     */
    async clear(): Promise<void> {
        const store = this.getStore('readwrite');
        const request = store.clear();
        await this.promisify(request);
    }
}

/**
 * LocalDB Engine.
 * A robust wrapper around IndexedDB that provides a simple object-oriented API
 * for managing multiple collections.
 */
export class LocalDB {
    private db: IDBDatabase | null = null;
    private config: DBConfig;
    private connectionPromise: Promise<void> | null = null;

    /**
     * Creates an instance of LocalDB.
     * @param {DBConfig} config - Database configuration (name, version, stores).
     */
    constructor(config: DBConfig) {
        this.config = config;
    }

    /**
     * Opens the IndexedDB connection.
     * Handles version upgrades and object store creation automatically based on config.
     * Implements singleton pattern to prevent race conditions.
     * 
     * @returns {Promise<void>} Resolves when connection is established.
     */
    async connect(): Promise<void> {
        // If already connected, do nothing
        if (this.db) return;
        
        // If a connection attempt is already in progress, return that promise
        if (this.connectionPromise) return this.connectionPromise;

        this.connectionPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.config.dbName, this.config.version);

            request.onerror = () => {
                console.error("IndexedDB Connection Failed:", request.error);
                this.connectionPromise = null; // Reset on failure so we can retry
                reject(request.error);
            };
            
            request.onsuccess = () => {
                this.db = request.result;
                
                // Handle version changes (e.g., another tab upgrades the DB)
                this.db.onversionchange = () => {
                    this.db?.close();
                    this.db = null;
                    this.connectionPromise = null;
                    console.warn("Database version changed. Connection closed.");
                };

                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                this.config.stores.forEach(storeName => {
                    if (!db.objectStoreNames.contains(storeName)) {
                        db.createObjectStore(storeName, { keyPath: 'id' });
                    }
                });
            };
        });

        return this.connectionPromise;
    }

    /**
     * Accesses a specific collection (Object Store).
     * 
     * @template T - The type of document stored in this collection.
     * @param {string} name - The name of the collection.
     * @returns {Collection<T>} The collection instance.
     * @throws {Error} If DB is not connected or collection is not in config.
     */
    collection<T extends BaseDocument>(name: string): Collection<T> {
        if (!this.db) throw new Error("Database not connected. Call connect() first.");
        if (!this.config.stores.includes(name)) throw new Error(`Collection ${name} not found in config.`);
        
        return new Collection<T>(this.db, name);
    }
}
