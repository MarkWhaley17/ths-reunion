require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;
const { createClient } = require('@supabase/supabase-js');

const app  = express();
const port = process.env.PORT || 3001;

// ── Cloudinary config ──
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Supabase config ──
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// ── Multer (memory storage — file goes straight to Cloudinary) ──
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  },
});

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));
app.use(express.json());

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ── Upload endpoint ──
app.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    const { name, caption } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'ths-reunion', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    // Save metadata to Supabase
    const { error: dbError } = await supabase
      .from('photos')
      .insert({
        name:        name.trim(),
        caption:     caption?.trim() || null,
        image_url:   result.secure_url,
        cloudinary_id: result.public_id,
        uploaded_at: new Date().toISOString(),
      });

    if (dbError) throw dbError;

    res.json({
      success: true,
      image_url: result.secure_url,
    });

  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed. Please try again.' });
  }
});

// ── Fetch all photos ──
app.get('/photos', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('uploaded_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Fetch error:', err);
    res.status(500).json({ error: 'Could not load photos.' });
  }
});

app.listen(port, () => {
  console.log(`THS Reunion API running on port ${port}`);
});
