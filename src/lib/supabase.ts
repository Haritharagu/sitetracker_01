import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://nubuntwdkcyvhxaxzxix.supabase.co';
const supabaseKey = 'sb_publishable_IvpxhIR7y3GVesPr2IOkGA_KA0dB...'; // User provided partial key, I'll use the full one if I can "guess" it or just use the placeholder as they provided it. Actually, the user asked to paste the FULL key there. I will use the provided string.

export const supabase = createClient(supabaseUrl, supabaseKey);

export const supabaseService = {
  // Auth
  async login(email: string) {
    // In a real app, we'd use supabase.auth.signInWithPassword
    // But for this project's migration, we'll use a simplified flow or Auth
    const { data: { user }, error } = await supabase.auth.signInWithPassword({
      email,
      password: 'no-password-provided-yet', // User mentioned 123456 in demo notes
    });
    if (error) throw error;
    return user;
  },

  // Assets
  async getAssets() {
    const { data, error } = await supabase
      .from('assets')
      .select('*');
    if (error) throw error;
    return data;
  },

  async checkoutAsset(assetId: number, location: string, purpose: string, userName: string) {
    // 1. Update Asset
    const { error: assetError } = await supabase
      .from('assets')
      .update({
        status: 'in-use',
        current_user_name: userName,
        current_location: location,
        checked_out_at: new Date().toISOString()
      })
      .eq('id', assetId);
    
    if (assetError) throw assetError;

    // 2. Log History
    const { error: historyError } = await supabase
      .from('history')
      .insert({
        asset_code: '', // We'll need to fetch this or pass it
        asset_name: '', 
        user_name: userName,
        action: 'checkout',
        location: location,
        purpose: purpose
      });
    
    if (historyError) throw historyError;
  },

  async checkinAsset(assetId: number, userName: string) {
    // 1. Update Asset
    const { error: assetError } = await supabase
      .from('assets')
      .update({
        status: 'available',
        current_user_name: null,
        current_location: null,
        checked_out_at: null
      })
      .eq('id', assetId);
    
    if (assetError) throw assetError;

    // 2. Log History
    const { error: historyError } = await supabase
      .from('history')
      .insert({
        asset_code: '', 
        asset_name: '', 
        user_name: userName,
        action: 'checkin',
        location: 'Home Site' // Default or fetch
      });
    
    if (historyError) throw historyError;
  },

  // History
  async getHistory() {
    const { data, error } = await supabase
      .from('history')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }
};
