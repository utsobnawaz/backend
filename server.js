const express = require("express");
require("dotenv").config();
const multer = require("multer");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json()); // Ensure JSON parsing
app.use(express.static("public"));

const mongoURI = process.env.MONGO_DB_URL;
const dbName = "mydatabase";
let db, filesCollection, client;

// Debugging: Check if .env is loaded correctly
console.log("🔍 MongoDB URI:", process.env.MONGO_DB_URL || "❌ Not Set!");

// ✅ MongoDB Connection Function
const connectToMongoDB = async () => {
  if (client) {
    console.log("ℹ️ MongoDB already connected.");
    return;
  }
  try {
    client = new MongoClient(mongoURI);
    await client.connect();
    db = client.db(dbName);
    filesCollection = db.collection("files");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ Error connecting to MongoDB:", err);
  }
};

// Ensure MongoDB is connected before handling requests
app.use(async (req, res, next) => {
  if (!db || !filesCollection) {
    await connectToMongoDB();
  }
  next();
});

// ✅ Multer Configuration (store file in memory)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files allowed"), false);
    }
  },
});

// ✅ Root Route
app.get("/", (req, res) => {
  res.send("Hello, World!");
});

// ✅ File Upload Route
app.post("/submit-form", upload.single("resume"), async (req, res) => {
  console.log("📩 Received file:", req.file);
  
  if (!req.file) {
    console.log("❌ No file uploaded");
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  try {
    const fileDoc = {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      data: req.file.buffer,
      uploadedAt: new Date(),
    };

    const result = await filesCollection.insertOne(fileDoc);
    console.log("✅ File saved to MongoDB:", result.insertedId);

    res.json({ success: true, fileId: result.insertedId });
  } catch (error) {
    console.error("❌ Error saving file:", error);
    res.status(500).json({ success: false, message: "File upload failed" });
  }
});

// ✅ Get List of Uploaded PDFs
app.get("/get-files", async (req, res) => {
  try {
    const files = await filesCollection.find({}).toArray();
    const fileList = files.map((file) => ({
      _id: file._id.toString(),
      filename: file.filename,
    }));

    res.json({ success: true, files: fileList });
  } catch (err) {
    console.error("❌ Error fetching files:", err);
    res.status(500).json({ success: false, message: "Error fetching files" });
  }
});

// ✅ Serve a File by ID
app.get("/file/:id", async (req, res) => {
  try {
    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (!file) {
      console.log("❌ File not found:", req.params.id);
      return res.status(404).json({ success: false, message: "File not found" });
    }

    console.log("✅ File found in MongoDB:", file.filename);
    res.set({ "Content-Type": file.contentType, "Content-Disposition": "inline" });
    res.send(file.data.buffer);
  } catch (err) {
    console.error("❌ Error fetching file:", err);
    res.status(500).json({ success: false, message: "Error fetching file" });
  }
});

// ✅ Server Setup
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await connectToMongoDB();
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app; // ✅ Export for Vercel
