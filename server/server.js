import cors from 'cors';
import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';
import multer from 'multer';
import jwt from 'jsonwebtoken';
import path from 'path';
import express from 'express';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const { MONGODB_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, PORT } = config;

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/admin', express.static(path.join(__dirname, '..', 'admin')));
app.use('/', express.static(path.join(__dirname, '..', 'public')));

let gfsBucket;
let mongoClient;


const pdfSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
  filename: { type: String, required: true },
  contentType: { type: String, default: 'application/pdf' },
  views: { type: Number, default: 0 },
  downloads: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  archived: { type: Boolean, default: false }
}, { versionKey: false });

const Pdf = mongoose.model('Pdf', pdfSchema);

async function init() {
  await mongoose.connect(MONGODB_URI);
  mongoClient = new MongoClient(MONGODB_URI);
  await mongoClient.connect();
  const db = mongoClient.db();
  gfsBucket = new GridFSBucket(db, { bucketName: 'pdfs' });
  console.log('Mongo connected. GridFS ready.');
}
init().catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function authAdmin(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'Missing Authorization header' });
  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('Invalid role');
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}


app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: 'admin', email }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});


app.post('/api/admin/upload', authAdmin, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const { title, description } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const filename = req.file.originalname || `${Date.now()}.pdf`;
    const contentType = req.file.mimetype || 'application/pdf';

    const uploadStream = gfsBucket.openUploadStream(filename, { contentType });
    uploadStream.end(req.file.buffer);
    uploadStream.on('error', (err) => {
      console.error('GridFS upload error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    });
    uploadStream.on('finish', async () => {
      try {
        const filesCollection = mongoClient.db().collection('pdfs.files');
        const fileDoc = await filesCollection.findOne({ filename });
        if (!fileDoc) return res.status(500).json({ error: 'File not found after upload' });

        const doc = await Pdf.create({
          title,
          description: description || '',
          fileId: fileDoc._id,
          filename: fileDoc.filename,
          contentType: fileDoc.contentType || 'application/pdf'
        });

        return res.json({ message: 'Uploaded', pdf: doc });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error after upload' });
      }
    });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/admin/:id', authAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const pdf = await Pdf.findById(id);
    if (!pdf) return res.status(404).json({ error: 'Not found' });

    await gfsBucket.delete(new ObjectId(pdf.fileId));
    await Pdf.deleteOne({ _id: id });
    return res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/admin/:id/archive', authAdmin, async (req, res) => {
  try {
    const pdf = await Pdf.findByIdAndUpdate(req.params.id, { archived: true }, { new: true });
    if (!pdf) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Archived', pdf });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});
app.patch('/api/admin/:id/unarchive', authAdmin, async (req, res) => {
  try {
    const pdf = await Pdf.findByIdAndUpdate(req.params.id, { archived: false }, { new: true });
    if (!pdf) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Unarchived', pdf });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/public/list', async (req, res) => {
  const now = Date.now();
  const items = await Pdf.find({}).sort({ createdAt: -1 }).lean();
  const result = items.map(pdf => {
    const ageDays = (now - new Date(pdf.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > 30) pdf.archived = true;
    return pdf;
  });
  res.json(result);
});

app.get('/api/public/view/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pdf = await Pdf.findByIdAndUpdate(id, { $inc: { views: 1 } }, { new: true });
    if (!pdf) return res.status(404).send('Not found');
    res.setHeader('Content-Type', pdf.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(pdf.filename)}`);
    gfsBucket.openDownloadStream(new ObjectId(pdf.fileId)).pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

app.get('/api/public/download/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pdf = await Pdf.findByIdAndUpdate(id, { $inc: { downloads: 1 } }, { new: true });
    if (!pdf) return res.status(404).send('Not found');
    const ext = path.extname(pdf.filename) || '.pdf';
    const safeName = pdf.filename.endsWith(ext) ? pdf.filename : pdf.filename + ext;
    res.setHeader('Content-Type', pdf.contentType || 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    gfsBucket.openDownloadStream(new ObjectId(pdf.fileId)).pipe(res);
  } catch (e) {
    console.error(e);
    res.status(500).send('Server error');
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Public app:  http://localhost:${PORT}/`);
  console.log(`Admin app:   http://localhost:${PORT}/admin/`);
});
