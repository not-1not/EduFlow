/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

// Setup Supabase Client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabase = supabaseUrl && supabaseAnonKey 
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

export const db = supabase;

export const collection = (db: any, name: string) => {
    return { type: 'collection', name };
};

export const doc = (db: any, colName: string, id: string) => {
    return { type: 'doc', collection: colName, id };
};

// Generic adapter to translate "firebase-like" gets to Supabase
export const getDocs = async (queryObject: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    let colName = queryObject.collectionName || queryObject.name;
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
    
    const { data, error } = await supabase.from(document.collection).select('*').eq('id', document.id).single();
    
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
    
    const newId = Math.random().toString(36).substr(2, 9);
    const payload = { ...data, id: newId };
    
    const { data: inserted, error } = await supabase.from(col.name).insert([payload]).select().single();
    if (error) throw error;
    
    return { id: newId };
};

export const setDoc = async (document: any, data: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const payload = { ...data, id: document.id };
    const { data: updated, error } = await supabase.from(document.collection).upsert(payload).select().single();
    if (error) throw error;
    return updated;
};

export const updateDoc = async (document: any, data: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { data: updated, error } = await supabase.from(document.collection).update(data).eq('id', document.id).select().single();
    if (error) throw error;
    return updated;
};

export const deleteDoc = async (document: any) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    
    const { error } = await supabase.from(document.collection).delete().eq('id', document.id);
    if (error) throw error;
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
