const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const db = new Database(path.join(__dirname, 'data.db'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_subscriber INTEGER DEFAULT 0,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      video_url TEXT NOT NULL,
      is_premium INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const adminEmail = 'admin@musicplatform.com';
  const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!adminExists) {
    const passwordHash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO users (name, email, password_hash, is_subscriber, is_admin) VALUES (?, ?, ?, 1, 1)'
    ).run('Site Admin', adminEmail, passwordHash);
  }

  const videoCount = db.prepare('SELECT COUNT(*) as count FROM videos').get().count;
  if (videoCount === 0) {
    const seedVideos = [
      {
        title: 'Welcome to Music Tutorials',
        description: 'A quick overview of how to use this platform.',
        video_url: 'https://www.youtube.com/embed/ktvTqknDobU',
        is_premium: 0
      },
      {
        title: 'Free Lesson: Beginner Chords',
        description: 'Learn foundational chords in this free lesson.',
        video_url: 'https://www.youtube.com/embed/2Vv-BfVoq4g',
        is_premium: 0
      },
      {
        title: 'Premium: Advanced Harmonic Techniques',
        description: 'Detailed, step-by-step advanced music theory training.',
        video_url: 'https://www.youtube.com/embed/fJ9rUzIMcZQ',
        is_premium: 1
      }
    ];

    const insertVideo = db.prepare(
      'INSERT INTO videos (title, description, video_url, is_premium) VALUES (?, ?, ?, ?)'
    );
    for (const video of seedVideos) {
      insertVideo.run(video.title, video.description, video.video_url, video.is_premium);
    }
  }
}

initDb();

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isSubscriber: Boolean(user.is_subscriber),
    isAdmin: Boolean(user.is_admin)
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  const user = req.session.user;
  if (!user || !user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existingUser) {
    return res.status(409).json({ error: 'Email is already registered.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
    .run(name.trim(), email.toLowerCase(), passwordHash);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  const safeUser = sanitizeUser(user);
  req.session.userId = user.id;
  req.session.user = safeUser;

  res.status(201).json({ user: safeUser });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const safeUser = sanitizeUser(user);
  req.session.userId = user.id;
  req.session.user = safeUser;

  res.json({ user: safeUser });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.post('/api/subscribe', requireAuth, (req, res) => {
  db.prepare('UPDATE users SET is_subscriber = 1 WHERE id = ?').run(req.session.userId);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  const safeUser = sanitizeUser(user);
  req.session.user = safeUser;
  res.json({ user: safeUser, message: 'Subscription activated! Premium tutorials unlocked.' });
});

app.get('/api/videos', (req, res) => {
  const user = req.session.user;
  const isSubscriber = Boolean(user?.isSubscriber);
  const isAdmin = Boolean(user?.isAdmin);

  const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  const payload = videos.map((video) => ({
    id: video.id,
    title: video.title,
    description: video.description,
    isPremium: Boolean(video.is_premium),
    canWatch: !video.is_premium || isSubscriber || isAdmin,
    videoUrl: !video.is_premium || isSubscriber || isAdmin ? video.video_url : null
  }));

  res.json({ videos: payload });
});

app.get('/api/admin/videos', requireAuth, requireAdmin, (_req, res) => {
  const videos = db.prepare('SELECT * FROM videos ORDER BY created_at DESC').all();
  res.json({ videos });
});

app.post('/api/admin/videos', requireAuth, requireAdmin, (req, res) => {
  const { title, description, videoUrl, isPremium } = req.body;
  if (!title || !videoUrl) {
    return res.status(400).json({ error: 'Title and video URL are required.' });
  }

  const result = db
    .prepare('INSERT INTO videos (title, description, video_url, is_premium) VALUES (?, ?, ?, ?)')
    .run(title.trim(), description?.trim() || '', videoUrl.trim(), isPremium ? 1 : 0);

  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ video });
});

app.put('/api/admin/videos/:id', requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { title, description, videoUrl, isPremium } = req.body;
  if (!title || !videoUrl) {
    return res.status(400).json({ error: 'Title and video URL are required.' });
  }

  const result = db
    .prepare('UPDATE videos SET title = ?, description = ?, video_url = ?, is_premium = ? WHERE id = ?')
    .run(title.trim(), description?.trim() || '', videoUrl.trim(), isPremium ? 1 : 0, id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Video not found.' });
  }

  const video = db.prepare('SELECT * FROM videos WHERE id = ?').get(id);
  res.json({ video });
});

app.delete('/api/admin/videos/:id', requireAuth, requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM videos WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Video not found.' });
  }
  res.json({ success: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
