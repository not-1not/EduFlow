/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const db = supabase;

// Table name mappings (code name -> exact Supabase table name)
const TABLE_MAPPING: Record<string, string> = {
    'attendance': 'attendance',
    'feeItems': 'feeItems',
    'studentPayments': 'studentPayments',
    'savingsTransactions': 'savingsTransactions',
    'classCashTransactions': 'classCashTransactions',
    'schoolDeposits': 'schoolDeposits'
};

export const getTableName = (name: string): string => {
    return TABLE_MAPPING[name] || name;
};

export const collection = (db: any, name: string) => {
    return { name: getTableName(name), collectionName: getTableName(name) };
};

export const doc = (db: any, colName: string, id: string) => {
    return { collection: getTableName(colName), name: getTableName(colName), id: id };
};

// Generic adapter to translate "firebase-like" gets to Supabase
export const getDocs = async (queryObject: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    // Support both collection(db, name) and { name: string } formats
    let colName = queryObject.name || queryObject.collectionName || queryObject;
    if (!colName) {
        console.error("Invalid queryObject:", queryObject);
        throw new Error("Invalid collection name");
    }
    
    console.log("Fetching from Supabase:", colName);
    
    let queryBuilder = supabase.from(colName).select('*');
    
    // Apply where clauses if queryObject is a query
    if (queryObject.filters) {
       for(const f of queryObject.filters) {
          if (f.op === '==') queryBuilder = (queryBuilder as any).eq(f.field, f.value);
          if (f.op === '>') queryBuilder = (queryBuilder as any).gt(f.field, f.value);
          if (f.op === '<') queryBuilder = (queryBuilder as any).lt(f.field, f.value);
       }
    }
    if (queryObject.orderBy) {
       queryBuilder = queryBuilder.order(queryObject.orderBy.field, { ascending: queryObject.orderBy.direction === 'asc' });
    }

    const { data, error } = await queryBuilder;
    if (error) {
        console.error("Supabase Query Error:", error);
        throw error;
    }

    console.log("Supabase data received:", colName, data?.length || 0, "records");

    // Return in firebase-like format: { docs: [{ id, data: () => {...} }] }
    const docs = data ? data.map((item: any) => ({
        id: item.id || '',
        data: () => item
    })) : [];

    return {
        docs,
        forEach: (callback: (doc: any) => void) => {
            docs.forEach(callback);
        }
    };
};

export const getDoc = async (document: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const tableName = getTableName(document?.collection || document?.name || document);
    const docId = document?.id;
    
    console.log("Fetching single doc:", tableName, docId);
    
    const { data, error } = await supabase.from(tableName).select('*').eq('id', docId).single();
    
    if (error || !data) {
        return {
            exists: () => false,
            data: () => null
        };
    }
    return {
        exists: () => true,
        data: () => data
    };
};

export const addDoc = async (col: any, data: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const tableName = getTableName(col?.name || col);
    const newId = Math.random().toString(36).substr(2, 9);
    const payload = { ...data, id: newId };
    
    console.log("Adding to Supabase:", tableName, payload);
    
    const { data: inserted, error } = await supabase.from(tableName).insert([payload]).select().single();
    if (error) {
        console.error("Supabase Insert Error:", error);
        throw error;
    }
    
    return { id: newId };
};

export const addDocs = async (col: any, rows: any[]) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const tableName = getTableName(col?.name || col);
    const payloads = rows.map((row) => ({ ...row, id: Math.random().toString(36).substr(2, 9) }));

    console.log("Bulk insert to Supabase:", tableName, payloads.length, "rows");

    const { error } = await supabase.from(tableName).insert(payloads);
    if (error) {
        console.error("Supabase Bulk Insert Error:", error);
        throw error;
    }

    return payloads.map((p) => ({ id: p.id }));
};

export const setDoc = async (document: any, data: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const tableName = getTableName(document?.collection || document?.name || document);
    const payload = { ...data, id: document?.id };
    
    console.log("Upserting to Supabase:", tableName, payload);
    
    const { data: updated, error } = await supabase.from(tableName).upsert(payload).select().single();
    if (error) {
        console.error("Supabase Upsert Error:", error);
        throw error;
    }
    return updated;
};

export const updateDoc = async (document: any, data: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const tableName = getTableName(document?.collection || document?.name || document);
    const docId = document?.id;
    
    console.log("Updating in Supabase:", tableName, docId, data);
    
    const { data: updated, error } = await supabase.from(tableName).update(data).eq('id', docId).select().single();
    if (error) {
        console.error("Supabase Update Error:", error);
        throw error;
    }
    return updated;
};

export const deleteDoc = async (document: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const tableName = getTableName(document?.collection || document?.name || document);
    const docId = document?.id;
    
    console.log("Deleting from Supabase:", tableName, docId);
    
    const { error } = await supabase.from(tableName).delete().eq('id', docId);
    if (error) {
        console.error("Supabase Delete Error:", error);
        throw error;
    }
    return { status: 'success' };
};

// Query mocks
export const query = (col: any, ...args: any[]) => {
    return { 
        name: col.name, 
        filters: args.filter(a => a.type === 'where'),
        orderBy: args.find(a => a.type === 'orderBy')
    };
};
export const where = (field: string, op: string, value: any) => ({ type: 'where', field, op, value });
export const orderBy = (field: string, direction: string = 'asc') => ({ type: 'orderBy', field, direction });

// Auth Mock (We keep it decoupled, system uses session storage + users table)
export const auth = {
    currentUser: null,
    onAuthStateChanged: (cb: any) => {
        return () => {};
    },
    signOut: async () => {}
};
