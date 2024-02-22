const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();
const Fuse = require('fuse.js');
const cors = require('cors');
const ejs = require('ejs');
const app = express();

const port = process.env.PORT || 3000;
const saltRounds = 10; // Number of salt rounds for bcrypt

/**
    @param path  {String}
    @param config {RequestInit}
*/

async function query(path, config){
    const url = process.env.DIRECTUS_URL;
    const token = process.env.DIRECTUS_TOKEN;
    const res = await fetch(`${url}${path}`, {
        headers: {
            "Authorization":`Bearer ${token}`
        },
        ...config
    });
    return await res.json();
}

async function getBlog(id){
    return query(`/items/blogs/${id}`, {
       method: 'GET',    
    })
}

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false } 
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/blogs', async (req, res) => {
    try {
        const blogs = await getBlog(2);
        res.render('blogs', { blogs });
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/register', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            'INSERT INTO users (name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING *',
            [fullName, email, phone, hashedPassword]
        );

        res.status(201).json({ success: true, user: result.rows[0] });
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isPasswordMatch = await bcrypt.compare(password, user.password);

            if (isPasswordMatch) {
                res.json({ success: true, user });
            } else {
                res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
        } else {
            res.status(401).json({ success: false, error: 'Invalid credentials' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.get('/messages', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'get_in_touch.html'));
});

app.post('/messages', async (req, res) => {
    try {
        // Extract data from the request body
        const { name, email, phone, message } = req.body;

        // Insert the data into the PostgreSQL database
        const query =
            'INSERT INTO messages (name, email, phone, message) VALUES ($1, $2, $3, $4) RETURNING id';
        const values = [name, email, phone, message];

        // Execute the query and get the inserted row's ID
        const result = await pool.query(query, values);
        const insertedRow = result.rows[0];

        console.log(result);

        // Send a response indicating successful insertion
        res.status(201).json({
            message: 'Data inserted successfully',
            insertedRowId: insertedRow.id,
        });
    } catch (error) {
        console.error('Error while inserting data:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

app.get('/api/hospitals', async (req, res) => {
    try {
        const result = await pool.query('SELECT hospital_name, hospital_url FROM hospitals');
        const hospitals = result.rows;
        res.json(hospitals);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});