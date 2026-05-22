const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path'); // Node.js built-in path utility
const app = express();

// Use Render's dynamic port or default to 3000 locally
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Set the database path to /tmp/database.sqlite for Render production environment
// If running locally on Windows, it will fallback safely to a local path
const dbPath = process.env.NODE_ENV === 'production' 
    ? '/tmp/database.sqlite' 
    : path.join(__dirname, 'database.sqlite');

// Initialize SQLite database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
    } else {
        console.log(`Connected to the SQLite database at: ${dbPath}`);
        // Create tasks table if it doesn't exist yet
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            status TEXT NOT NULL
        )`);
    }
});

// 1. GET: Fetch all tasks from the database
app.get('/tasks', (req, res) => {
    db.all('SELECT * FROM tasks', [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json({ tasks: rows });
    });
});

// 2. POST: Create a new task
app.post('/tasks', (req, res) => {
    const { title, status } = req.body;
    if (!title || !status) {
        return res.status(400).json({ error: 'Please provide both title and status' });
    }

    db.run('INSERT INTO tasks (title, status) VALUES (?, ?)', [title, status], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({
            message: 'Task created successfully!',
            data: { id: this.lastID, title, status }
        });
    });
});

// 3. PUT: Update an existing task by ID
app.put('/tasks/:id', (req, res) => {
    const { id } = req.params;
    const { title, status } = req.body;

    db.run(
        'UPDATE tasks SET title = ?, status = ? WHERE id = ?',
        [title, status, id],
        function (err) {
            if (err) {
                return res.status(500).json({ error: err.message });
            }
            if (this.changes === 0) {
                return res.status(404).json({ message: 'Task not found' });
            }
            res.json({ message: `Task ${id} updated successfully!`, data: { id, title, status } });
        }
    );
});

// 4. DELETE: Remove a task by ID
app.delete('/tasks/:id', (req, res) => {
    const { id } = req.params;

    db.run('DELETE FROM tasks WHERE id = ?', id, function (err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        if (this.changes === 0) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.json({ message: `Task ${id} deleted successfully!` });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});