const express = require('express');
require('dotenv').config(); // Load environment variables
const multer = require('multer');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const { ObjectId } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.static('public'));

const mongoURI = process.env.MONGO_DB_URL;
const dbName = 'test';
let db, filesCollection, client;

// Function to check MongoDB connection
const checkMongoDBConnection = async () => {
    if (client && client.topology && client.topology.isConnected()) {
        console.log('✅ MongoDB is connected');
    } else {
        console.log('❌ MongoDB is not connected');
    }
};

// Connect to MongoDB
const connectToMongoDB = async () => {
    try {
        client = await MongoClient.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });
        db = client.db(dbName);
        filesCollection = db.collection('files');
        console.log('✅ Connected to MongoDB');
        setInterval(checkMongoDBConnection, 5000); // Check connection every 5 seconds
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
    }
};

connectToMongoDB();

// Multer configuration (store file in memory)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Only PDF files allowed'), false);
        }
    }
});

app.get('/', (req, res) => {
    res.send('Hello, World!');
});

// File Upload Route
app.post('/submit-form', upload.single('resume'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    try {
        // Ensure the collection is defined and the MongoDB connection is established
        if (!filesCollection) {
            return res.status(500).json({ success: false, message: 'MongoDB collection is not initialized' });
        }

        const { originalname, mimetype, buffer } = req.file;
        await filesCollection.insertOne({ filename: originalname, contentType: mimetype, data: buffer });
        console.log("✅ File Uploaded to MongoDB:", originalname);
        res.status(200).json({ success: true, message: 'File Uploaded Successfully', filename: originalname });
    } catch (err) {
        console.error('Error saving file to MongoDB:', err);
        res.status(500).json({ success: false, message: 'Error saving file to MongoDB' });
    }
});

// Get List of Uploaded PDFs
app.get('/get-files', async (req, res) => {
    try {
        // Ensure the collection is defined and the MongoDB connection is established
        if (!filesCollection) {
            return res.status(500).json({ success: false, message: 'MongoDB collection is not initialized' });
        }

        const files = await filesCollection.find({}).toArray();
        const fileList = files.map(file => ({
            _id: file._id.toString(), // Convert ObjectId to string for frontend
            filename: file.filename
        }));

        res.json({ success: true, files: fileList });
    } catch (err) {
        console.error("❌ Error fetching files:", err);
        res.status(500).json({ success: false, message: 'Error fetching files' });
    }
});

// Serve a file from MongoDB for inline viewing
app.get('/file/:id', async (req, res) => {
    try {
        console.log("🔍 Fetching file by ID:", req.params.id);

        // Ensure the collection is defined and the MongoDB connection is established
        if (!filesCollection) {
            return res.status(500).json({ success: false, message: 'MongoDB collection is not initialized' });
        }

        const file = await filesCollection.findOne({ _id: new ObjectId(req.params.id) });

        if (!file) {
            console.log("❌ File not found:", req.params.id);
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        console.log("✅ File found in MongoDB:", file.filename);

        // Convert buffer data to a readable stream
        res.set({
            'Content-Type': file.contentType,
            'Content-Disposition': 'inline' // Forces the browser to open the file instead of downloading
        });

        res.send(file.data.buffer); // Send buffer properly
    } catch (err) {
        console.error("❌ Error fetching file:", err);
        res.status(500).json({ success: false, message: 'Error fetching file' });
    }
});

// Serve a file from MongoDB by filename
app.get('/file/:filename', async (req, res) => {
    try {
        console.log("🔍 Fetching file:", req.params.filename);

        // Ensure the collection is defined and the MongoDB connection is established
        if (!filesCollection) {
            return res.status(500).json({ success: false, message: 'MongoDB collection is not initialized' });
        }

        const file = await filesCollection.findOne({ filename: req.params.filename });

        if (!file) {
            console.log("❌ File not found:", req.params.filename);
            return res.status(404).json({ success: false, message: 'File not found' });
        }

        console.log("✅ File found in MongoDB:", file.filename);

        // Convert buffer data to a readable stream
        res.set({
            'Content-Type': file.contentType,
            'Content-Disposition': 'inline' // Forces the browser to open the file instead of downloading
        });

        res.send(file.data.buffer); // Send buffer properly
    } catch (err) {
        console.error("❌ Error fetching file:", err);
        res.status(500).json({ success: false, message: 'Error fetching file' });
    }
});

// Server setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on https://backend-ten-sigma-28.vercel.app/:${PORT}`);
});