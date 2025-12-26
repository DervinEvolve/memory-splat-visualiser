/**
 * API Route: Get Sharp Job Result
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed, use GET' });
  }

  try {
    const { request_id } = req.query;

    if (!request_id) {
      return res.status(400).json({ error: 'request_id is required' });
    }

    const { data: job, error: fetchError } = await supabase
      .from('sharp_jobs')
      .select('*')
      .eq('id', request_id)
      .single();

    if (fetchError || !job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found',
        request_id,
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Job not complete. Status: ${job.status}`,
        request_id,
        status: job.status,
      });
    }

    return res.status(200).json({
      success: true,
      request_id,
      ply_url: job.ply_url,
      filename: job.filename,
      size_bytes: job.size_bytes,
    });
  } catch (err) {
    console.error('[Sharp] Result error:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Unknown error',
    });
  }
}
