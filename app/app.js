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

const port = process.env.PORT || 3000;
const saltRounds = 10; // Number of salt rounds for bcrypt
const url = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_TOKEN;

/**
    @param path  {String}
    @param config {RequestInit}
*/

async function query(path, config) {
    const url = process.env.DIRECTUS_URL;
    const token = process.env.DIRECTUS_TOKEN;
    const res = await fetch(`${url}${path}`, {
        headers: {
            "Authorization": `Bearer ${token}`
        },
        ...config
    });
    return await res.json();
}

async function getBlog(id) {
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

app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
    }),
    secret: 'MPILHSALJD',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
}));

// Middleware to check if the user has an active session
const checkSession = (req, res, next) => {
    if (req.session.user) {
        next(); // Continue to the next middleware or route
    } else {
        res.redirect('/login.html'); // Redirect to the login page if no session is found
    }
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/blogs', checkSession, async (req, res) => {
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
        const userData = { fullName, email, phone, password: hashedPassword };
        const response = await fetch('http://127.0.0.1:8055/items/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(userData)
        });

        if (response.ok) {
            const responseData = await response.json();
            // Send success response
            res.status(201).json({ success: true, user: responseData });
        } else {
            // If the response is not okay, throw an error to be caught by the catch block
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error during registration:', error);
        // Send error response
        res.status(500).json({ success: false, error: 'Registration failed' });
    }
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Authenticate user with Directus credentials
        const response = await fetch('http://127.0.0.1:8055/items/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (response.ok) {
            const responseData = await response.json();
            // Store user information in the session
            req.session.user = {
                id: responseData.data.id,
                fname: responseData.data.firstname,
                lname: responseData.data.lastname,
                email: responseData.data.email,
                phone: responseData.data.phone
            };
            // Send success response
            res.json({ success: true, user: req.session.user });
        } else {
            // Send error response
            res.status(401).json({ success: false, error: 'Invalid credentials' });
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error during login:', error);
        // Send error response
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});


app.get('/messages', checkSession, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'get_in_touch.html'));
});

app.post('/messages', checkSession, async (req, res) => {
    try {
        // Extract data from the request body
        const { name, email, phone, message } = req.body;

        // Insert the data into Directus collection
        const response = await fetch('http://127.0.0.1:8055/items/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DIRECTUS_TOKEN}`
            },
            body: JSON.stringify({
                name,
                email,
                phone,
                message
            })
        });
        const responseData = await response.json();

        // Check if the insertion was successful
        if (response.ok) {
            // Send a response indicating successful insertion
            res.status(201).json({
                message: 'Data inserted successfully',
                insertedRowId: responseData.data.id,
            });
        } else {
            // Send error response if insertion failed
            res.status(500).json({ message: 'Failed to insert data', error: responseData });
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error while inserting data:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});

app.get('/api/hospitals', checkSession, async (req, res) => {
    try {
        // Fetch hospitals data from Directus
        const response = await fetch('http://127.0.0.1:8055/items/hospitals', {
            headers: { 'Authorization': `Bearer ${process.env.DIRECTUS_TOKEN}` }
        });
        const data = await response.json();

        // Check if the request was successful
        if (response.ok) {
            // Extract required fields from the response
            const hospitals = data.data.map(item => ({
                hospital_name: item.hospital_name,
                hospital_url: item.hospital_url
            }));

            // Send the hospitals data as JSON response
            res.json(hospitals);
        } else {
            // Send error response if fetching data failed
            res.status(500).json({ error: 'Failed to fetch hospitals data', data });
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error fetching hospitals data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/register-pharmacy', checkSession, async (req, res) => {
    const { pharmacyName, pharmacyLocation, pharmacySpecificLocation, email, phone, password } = req.body;

    try {
        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Prepare the data to be sent to Directus
        const data = {
            pharmacy_name: pharmacyName,
            pharmacy_location: pharmacyLocation,
            pharmacy_specific_location: pharmacySpecificLocation,
            email: email,
            phone: phone,
            password: hashedPassword
        };

        // Send a POST request to Directus to create a new pharmacy entry
        const response = await fetch('http://127.0.0.1:8055/items/pharmacies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DIRECTUS_TOKEN}`
            },
            body: JSON.stringify({ data })
        });

        // Check if the request was successful (HTTP status 200)
        if (response.ok) {
            const responseData = await response.json();
            // Send the success response along with the newly created user data
            res.status(201).json({ success: true, user: responseData.data });
        } else {
            // Send error response if the request fails
            const errorData = await response.json();
            res.status(500).json({ success: false, error: 'Registration failed', errorData });
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error during registration:', error);
        res.status(500).json({ success: false, error: 'Registration failed', error: error.message });
    }
});

app.post('/login-pharmacy', checkSession, async (req, res) => {
    const { email, password } = req.body;

    try {
        // Send a POST request to Directus to authenticate the pharmacy user
        const response = await fetch('http://127.0.0.1:8055/items/pharmacies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password
            })
        });

        // Check if the request was successful (HTTP status 200)
        if (response.ok) {
            const responseData = await response.json();
            // Send the success response along with the user data
            res.json({ success: true, user: responseData });
        } else {
            // Send error response if the request fails
            const errorData = await response.json();
            res.status(401).json({ success: false, error: 'Invalid credentials', errorData });
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, error: 'Login failed', error: error.message });
    }
});

app.get('/pharmacies', async (req, res) => {
    try {
        // Send a GET request to Directus to fetch the pharmacies data
        const response = await fetch('http://127.0.0.1:8055/items/pharmacieslist', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Check if the request was successful (HTTP status 200)
        if (response.ok) {
            const pharmacies = await response.json();
            // Send the pharmacies data back to the client as JSON
            res.json(pharmacies);
        } else {
            // Send error response if the request fails
            const errorData = await response.json();
            res.status(500).json({ error: 'Error fetching pharmacies data from Directus', errorData });
            throw new Error(`Failed to insert data: ${response.status} - ${response.statusText}`);
        }
    } catch (error) {
        console.error('Error fetching pharmacies data:', error);
        res.status(500).json({ error: 'Internal Server Error', error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
