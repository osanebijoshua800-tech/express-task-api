const express = require('express');
const app = express();
const PORT = 3000;

// CRUCIAL: This line tells Express to automatically understand JSON data sent to it
app.use(express.json());

// Your original GET route
app.get('/', (req, res) => {
    res.send('Hello World! Your Express API is working!');
});

// Your brand new POST route to handle creating a task
app.post('/tasks', (req, res) => {
    // Look inside the incoming request body for the data
    const taskTitle = req.body.title;
    const taskStatus = req.body.status;

    console.log(`Received a new task: ${taskTitle}`);

    // Send back a success response with the data we received
    res.status(201).json({
        message: "Task created successfully!",
        data: {
            title: taskTitle,
            status: taskStatus
        }
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});