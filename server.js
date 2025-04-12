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

app.use(async (req, res, next) => {
  if (!db || !filesCollection) await connectToMongoDB();
  next();
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"), false);
  },
});

app.get("/", (req, res) => {
  res.send("RUET VC Connect Backend is running...");
});

app.post("/submit-form", upload.single("resume"), async (req, res) => {
  const { passkey, category } = req.body;
  if (!passkey || !category) return res.status(400).json({ success: false, message: "Passkey and Category are required" });
  if (!req.file) return res.status(400).json({ success: false, message: "No PDF file uploaded" });

  const existingFile = await filesCollection.findOne({ passkey });
  if (existingFile) return res.status(400).json({ success: false, message: "Passkey already in use. Choose another." });

  try {
    const fileDoc = {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
      data: req.file.buffer,
      uploadedAt: new Date(),
      status: "under_processing",
      passkey,
      category,
      feedback: null,
    };

    const result = await filesCollection.insertOne(fileDoc);
    res.json({ success: true, fileId: result.insertedId });
  } catch (error) {
    console.error("❌ Error saving file:", error);
    res.status(500).json({ success: false, message: "File upload failed" });
  }
});

app.get("/file/passkey/:passkey", async (req, res) => {
  try {
    const file = await filesCollection.findOne({ passkey: req.params.passkey });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    res.set({ "Content-Type": file.contentType, "Content-Disposition": "inline" });
    res.send(file.data.buffer);
  } catch (err) {
    console.error("❌ Error fetching file by passkey:", err);
    res.status(500).json({ success: false, message: "Error fetching file" });
  }
});

app.get("/get-files", async (req, res) => {
  try {
    const files = await filesCollection.find({}).toArray();
    const fileList = files.map(file => ({
      _id: file._id.toString(),
      filename: file.filename,
      status: file.status,
      passkey: file.passkey,
      feedback: file.feedback,
      category: file.category || "Uncategorized",
      uploadDate: file.uploadedAt, // for frontend sorting
    }));

    res.json({ success: true, files: fileList });
  } catch (err) {
    console.error("❌ Error fetching files:", err);
    res.status(500).json({ success: false, message: "Error fetching files" });
  }
});

app.post("/update-status", async (req, res) => {
  const { id, status } = req.body;
  if (!id || !status) return res.status(400).json({ success: false, message: "Missing parameters" });

  try {
    const result = await filesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status } }
    );
    if (result.modifiedCount === 0) return res.status(404).json({ success: false, message: "File not found or status not updated" });

    res.json({ success: true, message: "Status updated successfully" });
  } catch (err) {
    console.error("❌ Error updating status:", err);
    res.status(500).json({ success: false, message: "Error updating status" });
  }
});

app.post("/submit-feedback", async (req, res) => {
  const { id, feedback } = req.body;
  if (!id || !feedback) return res.status(400).json({ success: false, message: "Missing parameters" });

  try {
    const result = await filesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { feedback } }
    );
    if (result.modifiedCount === 0) return res.status(404).json({ success: false, message: "File not found or feedback not updated" });

    res.json({ success: true, message: "Feedback submitted successfully" });
  } catch (err) {
    console.error("❌ Error submitting feedback:", err);
    res.status(500).json({ success: false, message: "Error submitting feedback" });
  }
});

app.post("/get-feedback", async (req, res) => {
  const { fileId, passkey } = req.body;
  if (!fileId || !passkey) return res.status(400).json({ success: false, message: "Missing parameters" });

  try {
    const file = await filesCollection.findOne({ _id: new ObjectId(fileId) });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    if (file.passkey !== passkey) return res.status(403).json({ success: false, message: "Incorrect passkey" });

    res.json({ success: true, feedback: file.feedback || "No feedback provided yet." });
  } catch (err) {
    console.error("❌ Error fetching feedback:", err);
    res.status(500).json({ success: false, message: "Error fetching feedback" });
  }
});

app.delete("/delete-file/:id", async (req, res) => {
  try {
    const fileId = req.params.id;
    const result = await filesCollection.deleteOne({ _id: new ObjectId(fileId) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: "File not found" });
    }

    res.json({ success: true, message: "File deleted" });
  } catch (err) {
    console.error("❌ Error deleting file:", err);
    res.status(500).json({ success: false, message: "Error deleting file" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await connectToMongoDB();
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
