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
const upload = multer({ dest: __dirname + '/uploads/' });
app.use('/uploads', express.static('/'));

// Configure PostgreSQL database connection using environment variables
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false },
});

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
        res.redirect('/home'); // Redirect to the login page if no session is found
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

async function getBlogs() {
    try {
        let res = await query(`/items/blogs`, {
            method: 'GET',
        });
        return await res.json();
    } catch (error) {
        console.error('Error fetching all blogs:', error);
        throw new Error('Error fetching all blogs');
    }
}

app.get('/blogs', checkSession, async (req, res) => {
    try {
        const blogs = await getBlogs();
        const id = req.session.user.id;
        const user = await getProfile(id);
        // console.log(user)
        res.render('blogs', { blogs: blogs.data, user: user.data[0] });
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/', (req, res) => {
    res.render('index');
});

app.get('/login', (req, res) => {
    res.render('login');
});

app.get('/home', checkSession,async (req, res) => {
    const id = req.session.user.id;
    const user = await getProfile(id);
    res.render('home', { user: user.data[0] });
});

app.get('/terms', async (req, res) => {
    const id = req.session.user.id;

    const user = await getProfile(id);
    res.render('terms', { user: user.data[0] });
});

async function getPharmacies() {
    try {
        const res = await query(`/items/users`, {
            method: 'GET',
        });
        return await res.json();
    } catch (error) {
        console.error('Error fetching referrals:', error);
        throw new Error('Error fetching referrals');
    }
}

app.get('/about', checkSession, async (req, res) => {
    const id = req.session.user.id;

    const user = await getProfile(id);

    res.render('about', { user: user.data[0] });
});

app.get('/pharmacy/home', checkSession, async (req, res) => {
    const id = req.session.user.id;
    const pharmacies = await getPharmacies();
    const user = await getProfile(id);
    res.render('pharmacy', { user: user.data[0], users: pharmacies.data });
});

app.get('/pharmacy/register', checkSession,(req, res) => {
    const user = req.session.user;
    res.render('pharmacy-register', { user: user });
});

app.get('/pharmacy/login', (req, res) => {
    const user = req.session.user;
    res.render('pharmacy-login', { user: user });
});

app.get('/messages', async (req, res) => {
    const id = req.session.user.id;

    const user = await getProfile(id);
    res.render('messages', { user: user.data[0] });
});

async function getOrders(pharmacyId) {
    try {
        const res = await query(`/items/orders?filter[pharmacy_id][_eq]=${pharmacyId}`, {
            method: 'GET',
        });
        return await res.json();
    } catch (error) {
        console.error('Error fetching referrals:', error);
        throw new Error('Error fetching referrals');
    }
}

app.get('/pharmacy/dashboard', checkSession, async (req, res) => {
    const id = req.session.user.id;
    const user = await getProfile(id);
    const pharmacyId = req.session.user.pharmacy_name;
    const orders = await getOrders(pharmacyId);
    res.render('dashboard', { user: user.data[0], orders: orders.data });
});

app.get('/confirmation', async (req, res) => {
    res.render('confirmation');
});

// Function to register a user asynchronously
async function registerUser(userData) {
    try {
        let res = await query(`/items/users/`, {
            method: 'POST',
            body: JSON.stringify(userData) // Send user data in the request body
        });
        return await res.json(); // Return parsed JSON response
    } catch (error) {
        console.error('Error registering user:', error);
        throw error; // Rethrow error for handling in the calling function
    }
}

// Route handler for POST /register
app.post('/register', async (req, res) => {
    try {
        const { fullName, email, phone, password } = req.body;

        // Validate required fields
        if (!fullName || !email || !phone || !password) {
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Construct user data object
        const userData = {
            name: fullName,
            email: email,
            phone: phone,
            password: hashedPassword
        };

        // Register the user using the async function
        const newUser = await registerUser(userData);

        // Send response indicating success
        res.status(201).json({ message: 'User registered successfully', user: newUser });
    } catch (error) {
        console.error('Error inserting user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function loginUser(email) {
    try {
        // console.log('Querying Directus for user with email:', email);
        const response = await query(`/items/users?filter[email][_eq]=${email}`, {
            method: 'SEARCH',
        });
        const users = await response.json(); // Extract JSON data from the response

        // Check if users array is empty or not
        if (!users || users.length === 0) {
            // console.log('No user found with email:', email);
        }

        return users;
    } catch (error) {
        console.error('Error querying user data:', error);
        throw new Error('Error querying user data');
    }
}

// Login route
app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Fetch user data from Directus
        const usersResponse = await loginUser(email);

        // If no user found, return invalid credentials error
        if (!usersResponse || !usersResponse.data || usersResponse.data.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = usersResponse.data[0]; // Extract the first user from the response

        // Compare provided password with the hashed password stored in the user's record
        const passwordMatch = await bcrypt.compare(password, user.password);

        // Handle invalid password
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Check user status (assuming user.checked is a boolean in the database)
        if (user.checked === true) {
            // Store user data in session
            req.session.user = user;
            // Respond with success message and redirect URL for verified users
            return res.status(200).json({ message: 'Login successful', redirect: '/home' });
        } else {
            // Respond with redirect URL for unverified users
            return res.status(200).json({ message: 'Login successful', redirect: '/guideline' });
        }

    } catch (error) {
        // Handle internal server error
        console.error('Error logging in user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function getProfile(userId) {
    try {
        const res = await query(`/items/users?filter[id][_eq]=${userId}`, {
            method: 'GET',
        });
        return await res.json();
    } catch (error) {
        console.error('Error fetching referrals:', error);
        throw new Error('Error fetching referrals');
    }
}

async function updateName(userData) {
    try {
        // Use your custom query function to send the update query
        const res = await query(`/items/users/${userData.id}`, {
            method: 'PATCH', // Assuming you want to update an existing item
            body: JSON.stringify(userData) // Convert userData to JSON string
        });
        const updatedData = await res.json();
        return updatedData; // Return updated data
    } catch (error) {
        console.error('Error:', error);
        throw new Error('Failed to update');
    }
}

async function updatePhone(userData) {
    try {
        // Use your custom query function to send the update query
        const res = await query(`/items/users/${userData.id}`, {
            method: 'PATCH', // Assuming you want to update an existing item
            body: JSON.stringify(userData) // Convert userData to JSON string
        });
        const updatedData = await res.json();
        return updatedData; // Return updated data
    } catch (error) {
        console.error('Error:', error);
        throw new Error('Failed to update');
    }
}

app.post('/edit-name', checkSession, async (req, res) => {
    try {
        const { newName } = req.body;

        const id = req.session.user.id;

        const userId = req.session.user.id;

        const userData = { id: id, name: newName }

        const updatedData = await updateName(userData);

        res.status(201).json({ message: 'Name updated successfully', updatedData });
    } catch (error) {
        console.error('Error updating name:', error);
        res.status(500).json({ message: 'Failed to update post. Please try again.' });
    }
});

app.post('/edit-phone', checkSession, async (req, res) => {

    try {
        const { newPhone } = req.body;
        const id = req.session.user.id;

        const userData = { id: id, phone: newPhone }

        const updatedData = await updatePhone(userData);

        res.status(201).json({ message: 'Phone updated successfully', updatedData });
    } catch (error) {
        console.error('Error updating phone:', error);
        res.status(500).json({ message: 'Failed to update post. Please try again.' });
    }

});

app.get('/petition', checkSession, (req, res) => {
    res.render('petition');
});

async function addPetition(userData) {
    try {
        let res = await query(`/items/petition/`, {
            method: 'POST',
            body: JSON.stringify(userData) // Send user data in the request body
        });
        return await res.json(); // Return parsed JSON response
    } catch (error) {
        console.error('Error registering user:', error);
        throw error; // Rethrow error for handling in the calling function
    }
}

app.post('/petition', checkSession, async (req, res) => {
    try {
        const { text } = req.body;
        const email = req.session.user.email;

        console.log(req.body);

        // Validate required fields
        if (!text) {
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Construct user data object
        const userData = {
            email: email,
            text: text
        };

        // Register the user using the async function
        const newComplaint = await addPetition(userData);

        // Send response indicating success
        res.status(201).json({ message: 'Petition filed successfully', petition: newComplaint });
    } catch (error) {
        console.error('Error inserting user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

async function registerPharmacy(userData) {
    try {
        // Use your custom query function to send the update query
        const res = await query(`/items/users/${userData.id}`, {
            method: 'PATCH', // Assuming you want to update an existing item
            body: JSON.stringify(userData) // Convert userData to JSON string
        });
        const updatedData = await res.json();
        return updatedData; // Return updated data
    } catch (error) {
        console.error('Error:', error);
        throw new Error('Failed to update');
    }
}

app.post('/pharmacy-register', checkSession, async (req, res) => {
    try {
        const { pharmacyName, pharmacyLocation, pharmacySpecificLocation, phone } = req.body;
        const id = req.session.user.id;

        // console.log(req.body);

        // Validate required fields
        if (!pharmacyName || !pharmacySpecificLocation || !pharmacyLocation || !phone) {
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Construct user data object
        const userData = {
            id: id,
            pharmacy_name: pharmacyName,
            location: pharmacyLocation,
            specific_location: pharmacySpecificLocation,
            pharmacy_phone: phone,
        };

        // Register the user using the async function
        const newPharmacy = await registerPharmacy(userData);

        // Send response indicating success
        res.status(201).json({ message: 'Pharmacy registered successfully', pharmacy: newPharmacy });
    } catch (error) {
        console.error('Error inserting user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/pharmacy-login', checkSession, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Fetch user data from Directus (assuming loginUser function works correctly)
        const usersResponse = await loginUser(email);

        // If no user found, return invalid credentials error
        if (!usersResponse || usersResponse.data.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = usersResponse.data[0]; // Extract the first user from the response

        // Compare provided password with the hashed password stored in the user's record
        const passwordMatch = await bcrypt.compare(password, user.password);

        // Handle invalid password
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (user.pharmacy_name === null) {
            return res.status(200).json({ message: 'No pharmacy', redirect: '/pharmacy/register' });
        } else {
            // Respond with redirect URL for unverified users
            return res.status(200).json({ message: 'Login successful', redirect: '/pharmacy/dashboard' });
        }

    } catch (error) {
        // Handle internal server error
        console.error('Error logging in user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/profile', checkSession, async (req, res) => {
    const id = req.session.user.id;

    const user = await getProfile(id);

    res.render('profile.ejs', { user: user.data[0] })
});

app.get('/guideline', checkSession, async (req, res) => {
    const user = req.session.user;
    res.render('guideline.ejs', { user: user });
});

async function registerOrder(orderData) {
    try {
        let res = await query(`/items/orders/`, {
            method: 'POST',
            body: JSON.stringify(orderData) // Send user data in the request body
        });
        return await res.json(); // Return parsed JSON response
    } catch (error) {
        console.error('Error registering user:', error);
        throw error; // Rethrow error for handling in the calling function
    }
}

// POST endpoint to handle orders
app.post('/orders', upload.single('imageFile'), async (req, res) => {
    try {
        const { userLocation, patientPhone, agreement, pharmacyName, pharmacyLocation, specificLocation } = req.body;
        const userId = req.session.user.id;

        // Get file path from req.file or set to null if no file uploaded
        const imagePath = req.file ? req.file.path : null;

        const orderData = {
            customer_location: userLocation,
            customer_phone: patientPhone,
            customer_consent: agreement,
            user_id: userId,
            pharmacy_id: pharmacyName,
            location: pharmacyLocation,
            specific_location: specificLocation,
            prescription: imagePath // Store image path in order data
        };

        console.log(orderData);

        // Register the order
        const newOrder = await registerOrder(orderData);

        // Send success response to the client
        res.status(200).json({
            success: true,
            message: 'Order registered successfully',
            order: newOrder // Optionally, send the newly created order details
        });
    } catch (error) {
        console.error('Error processing order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to register order',
            error: error.message // Optionally, send the error message
        });
    }
});

async function updatePic(userData) {
    try {
        // Use your custom query function to send the update query
        const res = await query(`/items/users/${userData.id}`, {
            method: 'PATCH', // Assuming you want to update an existing item
            body: JSON.stringify(userData) // Convert userData to JSON string
        });
        const updatedData = await res.json();
        return updatedData; // Return updated data
    } catch (error) {
        console.error('Error:', error);
        throw new Error('Failed to update');
    }
}

app.post('/update-pic', upload.single('profilePic'), async (req, res) => {
    try {
        // Ensure that req.file contains the expected file information
        const id = req.session.user.id;
        if (!req.file || !req.file.path) {
            return res.status(400).json({ message: 'No picture uploaded' });
        }

        // Use req.file.path or other relevant property to get the file path
        const picturePath = req.file.path;

        // Update userData object with profile_pic field
        const userData = {
            id: id, // Assuming req.user contains user information
            profile_pic: picturePath
        };

        console.log(userData);

        // Update user data with the new profile pic path
        const updatedData = await updatePic(userData);

        res.status(201).json({ message: 'Profile picture updated successfully', updatedData });
    } catch (error) {
        console.error('Error updating profile picture:', error);
    }
});

async function registerMessages(userData) {
    try {
        let res = await query(`/items/messages/`, {
            method: 'POST',
            body: JSON.stringify(userData) // Send user data in the request body
        });
        return await res.json(); // Return parsed JSON response
    } catch (error) {
        console.error('Error registering user:', error);
        throw error; // Rethrow error for handling in the calling function
    }
}

app.post('/messages', checkSession, async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;


        // console.log(req.body);

        // Validate required fields
        if (!name || !email || !phone || !message) {
            return res.status(400).json({ error: 'Please fill in all fields' });
        }

        // Construct user data object
        const userData = {
            name: name,
            email: email,
            phone: phone,
            message: message,
        };

        // Register the user using the async function
        const newMessage = await registerMessages(userData);

        // Send response indicating success
        res.status(201).json({ message: 'Message sent successfully', message: newMessage });
    } catch (error) {
        console.error('Error inserting user:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
