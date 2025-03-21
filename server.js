const express = require("express");
require("dotenv").config();
const multer = require("multer");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const mongoURI = process.env.MONGO_DB_URL;
const dbName = "mydatabase";
let db, filesCollection, client;

// ✅ Connect to MongoDB
const connectToMongoDB = async () => {
  if (client) return;
  try {
    client = new MongoClient(mongoURI);
    await client.connect();
    db = client.db(dbName);
    filesCollection = db.collection("files");
    console.log("✅ Connected to MongoDB");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err);
  }
};

// Ensure MongoDB is connected before handling requests
app.use(async (req, res, next) => {
  if (!db || !filesCollection) await connectToMongoDB();
  next();
});

// ✅ Multer Configuration (store files in memory)
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
  res.send("RUET VC Connect Backend is running...");
});

// ✅ File Upload Route (with Passkey)
app.post("/submit-form", upload.single("resume"), async (req, res) => {
  const { passkey } = req.body;
  if (!passkey) return res.status(400).json({ success: false, message: "Passkey is required" });

  const existingFile = await filesCollection.findOne({ passkey });
  if (existingFile) return res.status(400).json({ success: false, message: "Passkey already in use. Choose another." });

  if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

  try {
    const fileDoc = {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      data: req.file.buffer,
      uploadedAt: new Date(),
      status: "under_processing",
      passkey: passkey,
      feedback: null, // Initially no feedback
    };

    const result = await filesCollection.insertOne(fileDoc);
    res.json({ success: true, fileId: result.insertedId });
  } catch (error) {
    console.error("❌ Error saving file:", error);
    res.status(500).json({ success: false, message: "File upload failed" });
  }
});

// ✅ Retrieve File by Passkey (User Access)
app.get("/file/passkey/:passkey", async (req, res) => {
  try {
    const { passkey } = req.params;
    const file = await filesCollection.findOne({ passkey });

    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    res.set({ "Content-Type": file.contentType, "Content-Disposition": "inline" });
    res.send(file.data.buffer);
  } catch (err) {
    console.error("❌ Error fetching file:", err);
    res.status(500).json({ success: false, message: "Error fetching file" });
  }
});

// ✅ Get List of Uploaded PDFs (VC Panel)
app.get("/get-files", async (req, res) => {
  try {
    const files = await filesCollection.find({}).toArray();
    const fileList = files.map((file) => ({
      _id: file._id.toString(),
      filename: file.filename,
      status: file.status,
      passkey: file.passkey,
      feedback: file.feedback,
    }));

    res.json({ success: true, files: fileList });
  } catch (err) {
    console.error("❌ Error fetching files:", err);
    res.status(500).json({ success: false, message: "Error fetching files" });
  }
});

// ✅ Update Status for a File (VC Action)
app.post("/update-status", async (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ success: false, message: "Missing parameters" });

  try {
    const result = await filesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: status } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: "File not found or status not updated" });
    }

    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ success: false, message: "Error updating status" });
  }
});

// ✅ Submit Feedback (VC Action)
app.post("/submit-feedback", async (req, res) => {
  const { id, feedback } = req.body;
  if (!id || !feedback) return res.status(400).json({ success: false, message: "Missing parameters" });

  try {
    const result = await filesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { feedback: feedback } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: "File not found or feedback not updated" });
    }

    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (err) {
    console.error("❌ Error submitting feedback:", err);
    res.status(500).json({ success: false, message: "Error submitting feedback" });
  }
});

// ✅ Fetch Feedback Using Passkey and File ID (User Access)
app.post("/get-feedback", async (req, res) => {
  const { fileId, passkey } = req.body;
  if (!fileId || !passkey) {
    return res.status(400).json({ success: false, message: "Missing parameters" });
  }

  try {
    const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });

    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    if (file.passkey !== passkey) {
      return res.status(403).json({ success: false, message: "Incorrect passkey" });
    }

    res.json({ success: true, feedback: file.feedback || "No feedback provided yet." });
  } catch (err) {
    console.error("❌ Error fetching feedback:", err);
    res.status(500).json({ success: false, message: "Error fetching feedback" });
  }
});

// ✅ Serve a File by ID (VC Panel)
app.get("/file/:id", async (req, res) => {
  try {
    const file = await filesCollection.findOne({ _id: new ObjectId(req.params.id) });

    if (!file) return res.status(404).json({ success: false, message: "File not found" });

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

module.exports = app;
