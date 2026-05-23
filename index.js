const cors = require('cors');
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
 
app.use(cors());

// Hardcoded secret key for JWT signing (In production, use process.env.JWT_SECRET)
const JWT_SECRET = 'your_super_secret_jwt_key_123';

app.use(express.json());

// 1. Setup PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for cloud databases like Neon
    }
});

// 2. Initialize Database Tables
const initDb = async () => {
    try {
        // Create Users Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL
            );
        `);

        // Create Tasks Table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                status TEXT NOT NULL
            );
        `);
        console.log('PostgreSQL database tables verified/created successfully.');
    } catch (err) {
        console.error('Error initializing PostgreSQL database:', err.message);
    }
};
initDb();

app.get('/', (req, res) => {
    res.send('Task API is running smoothly on Render with PostgreSQL!');
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
        const hashedPassword = await bcrypt.hash(password, 10);

        const queryText = 'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id';
        const result = await pool.query(queryText, [email, hashedPassword]);

        res.status(201).json({ 
            message: 'User registered successfully!', 
            userId: result.rows[0].id 
        });
    } catch (error) {
        if (error.code === '23505') { // 23505 is the PostgreSQL code for unique key violation
            return res.status(400).json({ error: 'Email already registered.' });
        }
        res.status(500).json({ error: 'Error processing registration.' });
    }
});

// POST /login - Verify credentials and return JWT
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Please provide both email and password' });
    }

    try {
        const queryText = 'SELECT * FROM users WHERE email = $1';
        const result = await pool.query(queryText, [email]);
        const user = result.rows[0];

        if (!user) return res.status(400).json({ error: 'Invalid email or password.' });

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '1h' });
        res.json({ message: 'Login successful!', token });
    } catch (error) {
        res.status(500).json({ error: 'Error processing login.' });
    }
});

// ==========================================
// PROTECTED TASK ROUTES
// ==========================================

// GET /tasks - Only returns tasks belonging to the logged-in user
app.get('/tasks', authenticateToken, async (req, res) => {
    try {
        const queryText = 'SELECT * FROM tasks WHERE user_id = $1';
        const result = await pool.query(queryText, [req.user.id]);
        res.json({ tasks: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /tasks - Create a task bound to the logged-in user's ID
app.post('/tasks', authenticateToken, async (req, res) => {
    const { title, status } = req.body;
    if (!title || !status) {
        return res.status(400).json({ error: 'Please provide both title and status' });
    }

    try {
        const queryText = 'INSERT INTO tasks (user_id, title, status) VALUES ($1, $2, $3) RETURNING id';
        const result = await pool.query(queryText, [req.user.id, title, status]);
        
        res.status(201).json({
            message: 'Task created successfully!',
            data: { id: result.rows[0].id, user_id: req.user.id, title, status }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /tasks/:id - Update user's specific task
app.put('/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { title, status } = req.body;

    try {
        const queryText = 'UPDATE tasks SET title = $1, status = $2 WHERE id = $3 AND user_id = $4 RETURNING *';
        const result = await pool.query(queryText, [title, status, id, req.user.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Task not found or unauthorized' });
        }

        res.json({ message: `Task ${id} updated successfully!`, data: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /tasks/:id - Delete user's specific task
app.delete('/tasks/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const queryText = 'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING *';
        const result = await pool.query(queryText, [id, req.user.id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Task not found or unauthorized' });
        }

        res.json({ message: `Task ${id} deleted successfully!` });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});