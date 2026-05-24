const express = require('express');
const sqlite3 = require('sqlite3');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database (use /tmp/ on Render, ./ locally)
const dbPath = process.env.NODE_ENV === 'production' ? '/tmp/database.sqlite' : './database.sqlite';
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE,
  password_hash TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  title TEXT,
  status TEXT DEFAULT 'pending',
  FOREIGN KEY(user_id) REFERENCES users(id)
)`);

// JWT secret (use env variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key_change_this';

// Middleware to verify token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access denied' });
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
}

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Task API is running smoothly on Render!' });
});

// Register
app.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hashedPassword], function(err) {
      if (err) {
        if (err.message.includes('UNIQUE')) {
          return res.status(400).json({ error: 'Email already exists' });
        }
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, email });
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email } });
  });
});

// Get all tasks for authenticated user
app.get('/tasks', authenticateToken, (req, res) => {
  db.all('SELECT * FROM tasks WHERE user_id = ?', [req.user.id], (err, tasks) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(tasks);
  });
});

// Create task
app.post('/tasks', authenticateToken, (req, res) => {
  const { title, status } = req.body;
  if (!title) return res.status(400).json({ error: 'Title required' });
  
  db.run('INSERT INTO tasks (user_id, title, status) VALUES (?, ?, ?)',
    [req.user.id, title, status || 'pending'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.status(201).json({ id: this.lastID, title, status: status || 'pending', user_id: req.user.id });
    }
  );
});

// Update task
app.put('/tasks/:id', authenticateToken, (req, res) => {
  const { title, status } = req.body;
  db.run('UPDATE tasks SET title = ?, status = ? WHERE id = ? AND user_id = ?',
    [title, status, req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
      res.json({ message: 'Task updated' });
    }
  );
});

// Delete task
app.delete('/tasks/:id', authenticateToken, (req, res) => {
  db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Task not found' });
      res.status(204).send();
    }
  );
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});