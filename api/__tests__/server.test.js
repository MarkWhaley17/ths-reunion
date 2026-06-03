const request = require('supertest');
const path    = require('path');
const fs      = require('fs');

// ── Mock Cloudinary ──
jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload_stream: jest.fn((opts, cb) => {
        cb(null, {
          secure_url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
          public_id:  'ths-reunion/test',
        });
        return { end: jest.fn() };
      }),
    },
  },
}));

// ── Mock Supabase ──
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn(() => ({
        order: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'abc-123',
              name: 'Test User',
              caption: 'Test caption',
              image_url: 'https://res.cloudinary.com/test/image/upload/test.jpg',
              cloudinary_id: 'ths-reunion/test',
              uploaded_at: '2026-06-03T00:00:00.000Z',
            },
          ],
          error: null,
        }),
      })),
    })),
  })),
}));

const app = require('../server');

// ── Helpers ──
const testImagePath = path.join(__dirname, 'fixtures', 'test.jpg');

beforeAll(() => {
  // Create a minimal JPEG fixture for upload tests
  fs.mkdirSync(path.join(__dirname, 'fixtures'), { recursive: true });
  // 1×1 white JPEG (minimal valid JPEG bytes)
  const minimalJpeg = Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100ffc4001f0000010501010101010100000000000000000102030405060708090a0bffc40000ffda00030101003f00ffd9',
    'hex'
  );
  fs.writeFileSync(testImagePath, minimalJpeg);
});

afterAll(() => {
  fs.rmSync(path.join(__dirname, 'fixtures'), { recursive: true, force: true });
});

// ── Tests ──
describe('GET /health', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('GET /photos', () => {
  it('returns an array of photos', async () => {
    const res = await request(app).get('/photos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('image_url');
    expect(res.body[0]).toHaveProperty('name');
  });
});

describe('POST /upload', () => {
  it('rejects request with no file', async () => {
    const res = await request(app)
      .post('/upload')
      .field('name', 'Mark Whaley');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no image/i);
  });

  it('rejects request with no name', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('photo', testImagePath);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });

  it('rejects request with blank name', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('photo', testImagePath)
      .field('name', '   ');
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name is required/i);
  });

  it('succeeds with valid file and name', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('photo', testImagePath)
      .field('name', 'Mark Whaley')
      .field('caption', 'Prom 2001');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.image_url).toContain('cloudinary');
  });

  it('succeeds without a caption', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('photo', testImagePath)
      .field('name', 'Mark Whaley');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
