/**
 * API Route: Submit Sharp Image File for Splat Generation
 *
 * Accepts a file upload, uploads to Supabase storage, then submits to Modal.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: false, // Disable body parser for file uploads
  },
};

// Simple multipart parser for Vercel
async function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const boundary = contentType.split('boundary=')[1];

      if (!boundary) {
        reject(new Error('No boundary in multipart'));
        return;
      }

      // Parse multipart (simplified)
      const parts = buffer.toString('binary').split(`--${boundary}`);
      for (const part of parts) {
        if (part.includes('filename=')) {
          const filenameMatch = part.match(/filename="([^"]+)"/);
          const filename = filenameMatch ? filenameMatch[1] : 'upload.jpg';

          // Find the start of binary data (after headers)
          const headerEnd = part.indexOf('\r\n\r\n');
          if (headerEnd !== -1) {
            const dataStart = headerEnd + 4;
            const dataEnd = part.lastIndexOf('\r\n');
            const data = Buffer.from(part.slice(dataStart, dataEnd), 'binary');
            resolve({ filename, data });
            return;
          }
        }
      }
      reject(new Error('No file found in multipart'));
    });
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
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

    // Parse file from multipart
    const { filename, data } = await parseMultipart(req);
    console.log(`[Sharp] Received file: ${filename} (${data.length} bytes)`);

    // Upload to Supabase storage first
    const uploadPath = `sharp-uploads/${requestId}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from('hon-assets')
      .upload(uploadPath, data, {
        cacheControl: '3600',
        upsert: true,
        contentType: 'image/jpeg',
      });

    if (uploadError) {
      console.error('[Sharp] Upload error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload image' });
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('hon-assets')
      .getPublicUrl(uploadPath);

    const imageUrl = urlData.publicUrl;
    console.log(`[Sharp] Image uploaded to: ${imageUrl}`);

    // Store job
    await supabase
      .from('sharp_jobs')
      .insert({
        id: requestId,
        image_url: imageUrl,
        status: 'processing',
        created_at: new Date().toISOString(),
      });

    // Submit to Modal
    const modalEndpoint = process.env.MODAL_SHARP_ENDPOINT ||
      'https://dervinevolve--hon-sharp-splat-image-to-splat.modal.run';

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
      await supabase
        .from('sharp_jobs')
        .update({ status: 'failed', error: errorText })
        .eq('id', requestId);

      return res.status(502).json({
        success: false,
        request_id: requestId,
        error: `Modal failed: ${errorText}`,
      });
    }

    const result = await modalRes.json();

    // Upload PLY result
    const plyBuffer = Buffer.from(result.ply_data, 'base64');
    const storagePath = `splats/${requestId}/${result.filename || 'output.ply'}`;

    const { error: plyUploadError } = await supabase.storage
      .from('hon-assets')
      .upload(storagePath, plyBuffer, {
        cacheControl: '31536000',
        upsert: true,
        contentType: 'application/octet-stream',
      });

    if (plyUploadError) {
      await supabase
        .from('sharp_jobs')
        .update({ status: 'failed', error: plyUploadError.message })
        .eq('id', requestId);

      return res.status(500).json({
        success: false,
        request_id: requestId,
        error: `PLY upload failed: ${plyUploadError.message}`,
      });
    }

    const { data: plyUrlData } = supabase.storage
      .from('hon-assets')
      .getPublicUrl(storagePath);

    await supabase
      .from('sharp_jobs')
      .update({
        status: 'completed',
        ply_url: plyUrlData.publicUrl,
        filename: result.filename,
        size_bytes: result.size_bytes,
        completed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    return res.status(200).json({
      success: true,
      request_id: requestId,
    });

  } catch (err) {
    console.error('[Sharp] Submit-file error:', err);
    return res.status(500).json({
      success: false,
      request_id: requestId,
      error: err.message,
    });
  }
}
