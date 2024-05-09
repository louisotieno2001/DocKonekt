const express = require('express');
const session = require('express-session');
const multer = require('multer');
const pgSession = require('connect-pg-simple')(session);
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();
const Fuse = require('fuse.js');
const cors = require('cors');
const ejs = require('ejs');
const app = express();
const nodemailer = require('nodemailer');
const moment = require('moment');
const axios = require('axios');
const port = process.env.PORT || 3000;
const saltRounds = 10; // Number of salt rounds for bcrypt
const url = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_TOKEN;
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Configure PostgreSQL database connection using environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false },
});

const transporter = nodemailer.createTransport({
    host: 'smtp.dockonekt.com', // Your SMTP server details
    port: 587,
    auth: {
        user: 'customers-service@dockonekt.com',
        pass: '',
    },
});

const verificationCodes = {}; // { email: code }

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
    }),
    secret: 'sqT_d_qxWqHyXS6Yk7Me8APygz3EjFE8',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
}));

const checkSession = (req, res, next) => {
    if (req.session.user) {
        next(); // Continue to the next middleware or route
    } else {
        res.redirect('/login.html'); // Redirect to the login page if no session is found
    }
};

/**
    @param path  {String}
    @param config {RequestInit}
*/

async function query(path, config) {
    const res = await fetch(encodeURI(`${url}${path}`), {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        ...config
    });
    return res;
}

async function getBlog(id) {
    let res = await query(`/items/blogs/${id}`, {
        method: 'GET',
    });
    return await res.json();
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', async (req, res) => {
    const { fullName, email, phone, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            'INSERT INTO users (name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING *',
            [fullName, email, phone, hashedPassword]
        );
        console.log(result);

        if (result.rows.length > 0) {
            res.status(201).json({ success: true, user: result.rows[0] });
        } else {
            // Handle the case when result.rows is undefined or empty
            res.status(500).json({ success: false, error: 'Registration failed' });
        }
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const user = result.rows[0];
            const isPasswordMatch = await bcrypt.compare(password, user.password);

            if (isPasswordMatch) {
                // Store user information in the session
                req.session.user = user;

                // Check if the user's 'checked' field is true
                if (user.checked === true) {
                    // Send a JSON response indicating success and the redirect URL
                    res.json({ success: true, redirect: '/guideline' });
                } else {
                    // Send a JSON response indicating success and the redirect URL
                    res.json({ success: true, redirect: '/home.html' });
                }
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

app.post('/messages', checkSession, async (req, res) => {
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

app.get('/pharmacies', checkSession, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, pharmacy_name, pharmacy_location, pharmacy_specific_location, phone FROM pharmacists');
        const pharmacies = result.rows;

        // console.log('Pharmacies:', pharmacies);
        res.json(pharmacies);
    } catch (error) {
        console.error('Error fetching schedule data from PostgreSQL database:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/petition', checkSession, (req, res) => {
    res.render('petition');
});

app.post('/petition', checkSession, async (req, res) => {
    try {
        const { text } = req.body;

        const query =
            'INSERT INTO petition (text) VALUES ($1) RETURNING id';
        const values = [text];

        // Execute the query and get the inserted row's ID
        const result = await pool.query(query, values);
        const insertedRow = result.rows[0];

        res.status(201).json({
            message: 'Data inserted successfully',
            insertedRowId: insertedRow.id,
        });
    } catch (error) {
        console.error('Error while inserting data:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

app.post('/register-pharmacy', checkSession, async (req, res) => {
    const { pharmacyName, pharmacyLocation, pharmacySpecificLocation, email, phone, password } = req.body;

    try {
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        // Insert the data into the PostgreSQL database
        const query =
            'INSERT INTO pharmacists (pharmacy_name, pharmacy_location, pharmacy_specific_location, email, phone, password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id';
        const values = [pharmacyName, pharmacyLocation, pharmacySpecificLocation, email, phone, hashedPassword];

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

app.post('/login-pharmacy', checkSession, async (req, res) => {
    const { email, password } = req.body;

    try {
        const result = await pool.query('SELECT * FROM pharmacists WHERE email = $1', [email]);

        if (result.rows.length > 0) {
            const pharmacists = result.rows[0];
            const isPasswordMatch = await bcrypt.compare(password, pharmacists.password);

            if (isPasswordMatch) {
                // Store pharmacist information in the session
                req.session.pharmacists = pharmacists;

                res.json({ success: true, pharmacists });
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

app.get('/blogs', checkSession, async (req, res) => {
    try {
        const blogs = await getBlog(1);
        console.log(blogs);
        res.render('blogs', { blogs });
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/profile', checkSession, async (req, res) => {
    try {
        // Retrieve user ID from session or any other means of identification
        const userId = req.session.user.id; // Assuming you store the user ID in the session
        // console.log(userId);

        // Query to retrieve user information from the database using the user ID
        const query = 'SELECT name, phone, email FROM users WHERE id = $1';
        const result = await pool.query(query, [userId]);
        // console.log(result);
        // If user not found in the database
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Extract necessary information from the result
        const { name, phone, email } = result.rows[0];

        // console.log(result.rows[0]);

        // Render profile template and pass user's information to it
        res.render('profile', { name, phone, email });
    } catch (error) {
        console.error('Error fetching profile data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/guideline', checkSession, async (req, res) => {
    try {
        // Retrieve user ID from session or any other means of identification
        const userId = req.session.user.id; // Assuming you store the user ID in the session
        // console.log(userId);

        // Query to retrieve user information from the database using the user ID
        const query = 'SELECT name FROM users WHERE id = $1';
        const result = await pool.query(query, [userId]);
        // console.log(result);
        // If user not found in the database
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Extract necessary information from the result
        const { name } = result.rows[0];

        // console.log(result.rows[0]);

        // Render profile template and pass user's information to it
        res.render('guideline', { name });
    } catch (error) {
        console.error('Error fetching profile data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/hospitals', async (req, res) => {
    try {
        const result = await pool.query('SELECT hospital_name, hospital_url FROM hospitals');
        const hospitals = result.rows;

        res.json(hospitals);
    } catch (error) {
        console.error('Error fetching hospital data from PostgreSQL database:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/orders', async (req, res) => {
    const { userLocation, patientPhone, agreement, pharmacyId } = req.body;
    const userId = req.session.user.id;

    try {
        const result = await pool.query('INSERT INTO orders (user_location, patient_phone, agreement, user_id, pharmacy_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userLocation, patientPhone, agreement, userId, pharmacyId]);

        res.status(201).json({ success: true, order: result.rows[0] });
    } catch (error) {
        console.error('Error inserting order:', error);
        res.status(500).json({ success: false, error: 'Failed to insert order' });
    }
});

app.get('/get-orders', checkSession, async (req, res) => {
    const pharmacistId = req.session.pharmacists.id;

    try {
        const result = await pool.query(`
            SELECT orders.*, users.name AS user_name
            FROM orders
            INNER JOIN users ON orders.user_id = users.id
            WHERE orders.pharmacy_id = $1
        `, [pharmacistId]);
        const orders = result.rows;

        res.json(orders);
    } catch (error) {
        console.error('Error fetching orders data from PostgreSQL database:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/edit-name', checkSession, async (req, res) => {
    const { newName } = req.body;
    const userId = req.session.user.id;

    try {
        // Update the user's name in the database
        const result = await pool.query(
            'UPDATE users SET name = $1 WHERE id = $2 RETURNING *',
            [newName, userId]
        );

        if (result.rows.length > 0) {
            const updatedUser = result.rows[0];
            req.session.user = updatedUser; // Update user session information if needed
            res.status(200).json({ success: true, user: updatedUser });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating user name:', error);
        res.status(500).json({ success: false, error: 'Failed to update user name' });
    }
});

app.post('/edit-phone', checkSession, async (req, res) => {
    const { newPhone } = req.body;
    const userId = req.session.user.id;

    try {
        // Update the user's phone number in the database
        const result = await pool.query(
            'UPDATE users SET phone = $1 WHERE id = $2 RETURNING *',
            [newPhone, userId]
        );

        if (result.rows.length > 0) {
            const updatedUser = result.rows[0];
            req.session.user = updatedUser; // Update user session information if needed
            res.status(200).json({ success: true, user: updatedUser });
        } else {
            res.status(404).json({ success: false, error: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating user phone number:', error);
        res.status(500).json({ success: false, error: 'Failed to update user phone number' });
    }
});

app.post('/search', async (req, res) => {

});

app.get('/confirmation', async (req, res) => {
  res.render('confirmation');
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
