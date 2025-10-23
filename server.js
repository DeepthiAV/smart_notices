require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Ensure uploads folder exists =====
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
    console.log('📂 Created uploads folder');
}

// ===== Middleware =====
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Base64 images large ah irukum so limit 10MB
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploads folder for normal images
app.use('/uploads', express.static(uploadsDir));

// Serve static frontend files from "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// ===== MongoDB Connection =====
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ===== User Schema =====
const userSchema = new mongoose.Schema({
    username: { type: String, required: false },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', userSchema);

// ===== Message Schema =====
const messageSchema = new mongoose.Schema({
    username: String,
    text: String,
    image: String, // can be path or base64
    date: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// ===== Resume Analysis Schema =====
const resumeAnalysisSchema = new mongoose.Schema({
    email: String,
    originalFilename: String,
    mimeType: String,
    text: String,
    stats: Object,
    createdAt: { type: Date, default: Date.now }
});
const ResumeAnalysis = mongoose.model('ResumeAnalysis', resumeAnalysisSchema);

// ===== Multer Storage Config for file upload =====
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// ===== External libraries for resume parsing =====
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const englishWords = new Set(require('an-array-of-english-words'));

function tokenize(text) {
    return (text || '')
        .replace(/\r/g, '')
        .split(/\n/)
        .map(line => line.trimEnd())
        .join('\n');
}

function analyzeResumeText(rawText) {
    const text = tokenize(rawText);
    const lines = text.split(/\n+/);
    const words = text
        .toLowerCase()
        .replace(/[^a-zA-Z\s'-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

    const wordCount = words.length;

    // Spelling detection: words not in dictionary, ignoring short and obvious proper nouns
    const misspellings = [];
    for (const w of words) {
        if (w.length <= 2) continue;
        if (/^[a-z]+'[a-z]+$/.test(w)) {
            // contractions are fine
        }
        if (!englishWords.has(w)) {
            misspellings.push(w);
        }
    }

    // Deduplicate and cap
    const missUnique = Array.from(new Set(misspellings)).slice(0, 50);

    // Grammar heuristics
    const grammarWarnings = [];
    const sentences = text.split(/(?<=[.!?])\s+/);
    sentences.forEach((s) => {
        const sTrim = s.trim();
        if (!sTrim) return;
        const tokens = sTrim.split(/\s+/);
        if (tokens.length > 35) {
            grammarWarnings.push('Very long sentence; consider splitting: "' + sTrim.slice(0, 60) + '…"');
        }
        if (!/^[A-Z]/.test(sTrim)) {
            grammarWarnings.push('Sentence should start with a capital letter: "' + sTrim.slice(0, 40) + '…"');
        }
        if (/\s{2,}/.test(sTrim)) {
            grammarWarnings.push('Extra spaces detected in: "' + sTrim.slice(0, 60) + '…"');
        }
    });

    // Alignment/Bullet consistency heuristics
    const alignmentIssues = [];
    const leadingSpaces = lines.map(l => (l.match(/^\s*/)[0] || '').length);
    const variance = leadingSpaces.length
        ? leadingSpaces.reduce((a, b) => a + Math.pow(b - (leadingSpaces.reduce((x, y) => x + y, 0) / leadingSpaces.length), 2), 0) / leadingSpaces.length
        : 0;
    if (variance > 8) alignmentIssues.push('Inconsistent left alignment/indentation across lines.');
    const bulletChars = lines
        .map(l => (l.trim().match(/^[-•–·*]/) ? l.trim()[0] : null))
        .filter(Boolean);
    const bulletSet = new Set(bulletChars);
    if (bulletSet.size > 1) alignmentIssues.push('Mixed bullet styles detected; use a consistent bullet.');

    // Font suggestions (limited without layout)
    const fontIssues = ['Unable to verify fonts from plain text. Ensure a professional font (e.g., Calibri/Helvetica) and consistent sizes (10–12pt).'];

    // Suggestions
    const suggestions = [];
    if (missUnique.length > 0) suggestions.push('Fix spelling mistakes; consider a spell checker.');
    if (grammarWarnings.length > 0) suggestions.push('Improve sentence structure; aim for concise bullet points.');
    if (alignmentIssues.length > 0) suggestions.push('Align bullets and sections consistently with uniform spacing.');

    return {
        wordCount,
        misspellings: missUnique,
        grammarWarnings: grammarWarnings.slice(0, 50),
        alignmentIssues,
        fontIssues,
        suggestions: suggestions.length ? suggestions : ['Looks good overall; consider quantifying achievements and adding keywords.']
    };
}

// ===== Routes =====

// Default route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Auth (new API with email) =====
app.post('/api/users/check-email', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ exists: false, message: 'Email required' });
        const user = await User.findOne({ email });
        res.json({ exists: !!user });
    } catch (err) {
        res.status(500).json({ exists: false });
    }
});

app.post('/api/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username: username || email.split('@')[0], email, password: hashedPassword });
        await newUser.save();
        res.json({ success: true, message: 'Signup successful' });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password required' });
        }
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, which: 'email', message: 'Email not found' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ success: false, which: 'password', message: 'Incorrect password' });
        }
        res.json({ success: true, message: 'Login successful' });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ===== Upload Notice (Normal file upload) =====
app.post('/upload', upload.single('image'), async (req, res) => {
    try {
        console.log("=== Upload Debug Start ===");
        console.log("Body:", req.body);
        console.log("File:", req.file);
        console.log("==========================");

        const { text, username } = req.body;
        if (!text && !req.file) {
            return res.status(400).json({ success: false, message: 'Text or image is required' });
        }

        const imagePath = req.file ? `/uploads/${req.file.filename}` : null;
        const newMessage = new Message({ username, text, image: imagePath });
        await newMessage.save();

        res.json({ success: true, message: 'Upload successful', data: newMessage });

    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ===== Upload Notice (Base64) =====
app.post('/upload_base64', async (req, res) => {
    try {
        const { text, username, imageBase64 } = req.body;

        console.log("=== Upload Base64 Debug ===");
        console.log("Text:", text);
        console.log("Username:", username);
        console.log("Image Base64 present?", !!imageBase64);
        console.log("===========================");

        if (!text && !imageBase64) {
            return res.status(400).json({ success: false, message: 'Text or image is required' });
        }

        const newMessage = new Message({
            username: username || "guest",
            text: text || null,
            image: imageBase64 || null
        });

        await newMessage.save();
        res.json({ success: true, message: 'Upload successful', data: newMessage });

    } catch (err) {
        console.error('Upload Base64 error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ===== Resume Analyze =====
app.post('/api/resume/analyze', upload.single('resume'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Resume file is required' });
        }
        const { email } = req.body;
        const filePath = req.file.path;
        const mime = req.file.mimetype;
        let text = '';
        if (mime === 'application/pdf') {
            const data = await pdfParse(fs.readFileSync(filePath));
            text = data.text || '';
        } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const result = await mammoth.extractRawText({ path: filePath });
            text = result.value || '';
        } else if (mime === 'text/plain') {
            text = fs.readFileSync(filePath, 'utf8');
        } else if (mime === 'application/msword') {
            // .doc not supported by mammoth without extra deps
            text = '';
        } else {
            // Attempt to read as text fallback
            try { text = fs.readFileSync(filePath, 'utf8'); } catch { text = ''; }
        }

        const stats = analyzeResumeText(text);
        const saved = await new ResumeAnalysis({
            email: email || null,
            originalFilename: req.file.originalname,
            mimeType: mime,
            text,
            stats
        }).save();

        res.json({ success: true, analysisId: saved._id.toString(), analysis: saved.stats, limited: mime === 'application/msword' && text.length === 0 });
    } catch (err) {
        console.error('Resume analyze error:', err);
        res.status(500).json({ success: false, message: 'Failed to analyze resume' });
    }
});

app.get('/api/resume/analysis/:id', async (req, res) => {
    try {
        const doc = await ResumeAnalysis.findById(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Not found' });
        res.json({ success: true, analysis: doc.stats });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ===== Mock interview simple chat API =====
app.post('/api/mock/chat', async (req, res) => {
    try {
        const { message } = req.body || {};
        const msg = (message || '').toLowerCase();
        let reply = '';
        if (!msg) reply = 'Hello! Ask me a mock interview question or say "ask me" to begin.';
        else if (/(ask|start)/.test(msg)) reply = 'Tell me about yourself. Keep it under 90 seconds and focus on achievements.';
        else if (/strength/.test(msg)) reply = 'A strong answer focuses on 1-2 strengths with examples. What is one strength you bring?';
        else if (/weakness|improv/.test(msg)) reply = 'Pick a real, non-critical weakness and show how you are improving it.';
        else if (/salary/.test(msg)) reply = 'You can say you are open based on market data and overall fit; ask for the range.';
        else if (/why.*hire/.test(msg)) reply = 'Tie your skills to the job impact with a quantifiable example from your resume.';
        else reply = 'Good point. Can you add a metric or describe the impact in numbers?';
        res.json({ success: true, reply });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// ===== Get Latest Notice =====
app.get('/api/notice/latest', async (req, res) => {
    try {
        const latest = await Message.findOne().sort({ date: -1 });
        if (!latest) {
            return res.json({ text: 'No notice text available.', image: null });
        }
        res.json({ text: latest.text, image: latest.image || null });
    } catch (err) {
        console.error('Fetch latest notice error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// ===== Get All Messages =====
app.get('/messages', async (req, res) => {
    try {
        const messages = await Message.find().sort({ date: -1 });
        res.json(messages);
    } catch (err) {
        console.error('Fetch messages error:', err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// ===== Start Server =====
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
});
