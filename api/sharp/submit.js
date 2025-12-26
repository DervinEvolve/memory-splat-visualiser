/**
 * API Route: Submit Sharp Image-to-Splat Job
 *
 * Submits an image to Modal's Sharp function for Gaussian splat generation.
 * Waits for Modal to complete and stores the result in Supabase.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  maxDuration: 300, // 5 minutes
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed, use POST' });
  }

  const requestId = `sharp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

  try {
    const tokenId = process.env.MODAL_TOKEN_ID;
    const tokenSecret = process.env.MODAL_TOKEN_SECRET;

    if (!tokenId || !tokenSecret) {
      return res.status(500).json({ error: 'Modal credentials not configured' });
    }

    const modalToken = `${tokenId}:${tokenSecret}`;

    const { imageUrl } = req.body || {};

    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // Store job as processing
    const { error: insertError } = await supabase
      .from('sharp_jobs')
      .insert({
        id: requestId,
        image_url: imageUrl,
        status: 'processing',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.warn('[Sharp] Failed to store job:', insertError);
    }

    // Modal endpoint (same as Hon project)
    const modalEndpoint = process.env.MODAL_SHARP_ENDPOINT ||
      'https://dervinevolve--hon-sharp-splat-image-to-splat.modal.run';

    console.log(`[Sharp] Submitting job ${requestId} to Modal`);

    const modalRes = await fetch(modalEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${modalToken}`,
      },
      body: JSON.stringify({ image_url: imageUrl }),
    });

    if (!modalRes.ok) {
      const errorText = await modalRes.text();
      console.error(`[Sharp] Modal error:`, errorText);

      await supabase
        .from('sharp_jobs')
        .update({ status: 'failed', error: errorText })
        .eq('id', requestId);

      return res.status(502).json({
        success: false,
        request_id: requestId,
        error: `Modal processing failed: ${errorText}`,
      });
    }

    const result = await modalRes.json();
    console.log(`[Sharp] Job ${requestId} completed`);

    // Upload PLY to Supabase Storage
    const plyBuffer = Buffer.from(result.ply_data, 'base64');
    const storagePath = `splats/${requestId}/${result.filename || 'output.ply'}`;

    const { error: uploadError } = await supabase.storage
      .from('hon-assets')
      .upload(storagePath, plyBuffer, {
        cacheControl: '31536000',
        upsert: true,
        contentType: 'application/octet-stream',
      });

    if (uploadError) {
      console.error(`[Sharp] Upload failed:`, uploadError);
      await supabase
        .from('sharp_jobs')
        .update({ status: 'failed', error: `Upload failed: ${uploadError.message}` })
        .eq('id', requestId);

      return res.status(500).json({
        success: false,
        request_id: requestId,
        error: `Upload failed: ${uploadError.message}`,
      });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('hon-assets')
      .getPublicUrl(storagePath);

    const plyUrl = urlData.publicUrl;

    // Update job with URL
    await supabase
      .from('sharp_jobs')
      .update({
        status: 'completed',
        ply_url: plyUrl,
        filename: result.filename,
        size_bytes: result.size_bytes,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return res.status(200).json({
      success: true,
      request_id: requestId,
      message: 'Splat generation complete.',
    });

  } catch (err) {
    console.error('[Sharp] Submit error:', err);

    await supabase
      .from('sharp_jobs')
      .update({ status: 'failed', error: err.message || 'Unknown error' })
      .eq('id', requestId);

    return res.status(500).json({
      success: false,
      request_id: requestId,
      error: err.message || 'Unknown error',
    });
  }
}
