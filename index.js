const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Hardcoded secret key for JWT signing (In production, use process.env.JWT_SECRET)
const JWT_SECRET = 'your_super_secret_jwt_key_123';

app.use(express.json());

// Set database path to /tmp for Render compatibility
const dbPath = process.env.NODE_ENV === 'production' 
    ? '/tmp/database.sqlite' 
    : path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log(`Connected to database at: ${dbPath}`);
        
        // 1. Create Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )`);

        // 2. Create Tasks Table (Now linked to user_id)
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            status TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);
    }
});

// ==========================================
// MIDDLEWARE: Authenticate JWT Token
// ==========================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Expecting "Bearer <TOKEN>"

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token.' });
        }
        req.user = user; // Attach user payload (id, email) to request object
        next();
    });
}

// ==========================================
// AUTH ENDPOINTS
// ==========================================

// POST /register - Securely register a user
app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide both email and password' });
    }

    try {
        // Hash password with a salt round of 10
        const hashedPassword = await bcrypt.hash(password, 10);

        db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hashedPassword], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) {
                    return res.status(400).json({ error: 'Email already registered.' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.status(201).json({ message: 'User registered successfully!', userId: this.lastID });
        });
    } catch (error) {
        res.status(500).json({ error: 'Error processing registration.' });
    }
});

// POST /login - Verify credentials and return JWT
app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide both email and password' });
    }

    db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(400).json({ error: 'Invalid email or password.' });

        try {
            // Compare entered password with hashed database password
            const validPassword = await bcrypt.compare(password, user.password_hash);
            if (!validPassword) {
                return res.status(400).json({ error: 'Invalid email or password.' });
            }

            // Generate JWT Token (valid for 1 hour)
            const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ message: 'Login successful!', token });
        } catch (error) {
            res.status(500).json({ error: 'Error processing login.' });
        }
    });
});

// ==========================================
// PROTECTED TASK ROUTES (Now secured by authenticateToken)
// ==========================================

// GET /tasks - Only returns tasks belonging to the logged-in user
app.get('/tasks', authenticateToken, (req, res) => {
    db.all('SELECT * FROM tasks WHERE user_id = ?', [req.user.id], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ tasks: rows });
    });
});

// POST /tasks - Create a task bound to the logged-in user's ID
app.post('/tasks', authenticateToken, (req, res) => {
    const { title, status } = req.body;
    if (!title || !status) {
        return res.status(400).json({ error: 'Please provide both title and status' });
    }

    db.run('INSERT INTO tasks (user_id, title, status) VALUES (?, ?, ?)', [req.user.id, title, status], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({
            message: 'Task created successfully!',
            data: { id: this.lastID, user_id: req.user.id, title, status }
        });
    });
});

// PUT /tasks/:id - Update user's specific task
app.put('/tasks/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { title, status } = req.body;

    db.run(
        'UPDATE tasks SET title = ?, status = ? WHERE id = ? AND user_id = ?',
        [title, status, id, req.user.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            if (this.changes === 0) return res.status(404).json({ message: 'Task not found or unauthorized' });
            
            res.json({ message: `Task ${id} updated successfully!`, data: { id, title, status } });
        }
    );
});

// DELETE /tasks/:id - Delete user's specific task
app.delete('/tasks/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM tasks WHERE id = ? AND user_id = ?', [id, req.user.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ message: 'Task not found or unauthorized' });
        
        res.json({ message: `Task ${id} deleted successfully!` });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});