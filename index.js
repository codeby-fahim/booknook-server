import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';


// Primary Connection
const app = express();
const PORT = process.env.PORT | 5000; 
app.use(cors());
app.use(express.json());

// Middleware
const verifyToken = async(req, res, next)=>{
  const authHeaders = req.headers.authorization;
  if(!authHeaders){
    return res.status(401).send({msg: "Unauthorized"})
  }
  const token = authHeaders.split(" ")[1]
  if(!token){
        return res.status(401).send({ msg: "Unauthorized" });
  }
  const JWKS = createRemoteJWKSet(
    new URL(`${process.env.BETTER_AUTH_URL}/api/auth/jwks`)
  )
  try {
    const {payload} = await jwtVerify(token, JWKS);
    return next();
  } catch (error) {
    return res.status(500).send({msg: "Server error"})
  }
}


// MongoDB Connection
const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log(" successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const mongoClient = await connectToMongoDB();
const db = mongoClient.db("booknook");
const booksCollection = db.collection("books");
const borrowsCollection = db.collection("borrows");



app.get('/', ( req, res)=>{
  res.send("Welcome to booknook server")
})
app.post('/add-books',verifyToken, async(req, res)=>{
  const data = req.body;
  const result = await booksCollection.insertOne(data);
  res.send(result);
})
// Public endpoints: guests can browse the catalogue and new arrivals.
app.get('/all-books', async(req, res)=>{
  const result = await booksCollection.find({}).sort({createdAt: -1}).toArray();
  res.send(result);
})
app.get('/all-books/:id', async(req, res)=>{
  const {id} = req.params;
  const result = await booksCollection.findOne({_id: new ObjectId(id)})
  res.send(result)
})
app.get('/arrival-books', async(req, res)=>{
  const result = await booksCollection.find({}).sort({createdAt: -1}).limit(6).toArray();
  res.send(result);
})
app.get('/my-books/:email',verifyToken, async(req, res)=>{
  const {email} = req.params;
  const result = await booksCollection.find({"addedBy.email": email}).toArray();
  res.send(result)
})
app.delete('/my-books/:email',verifyToken, async(req, res)=>{
  const {email} = req.params;
  const {bookId} = req.body ?? {};
  const filter = {"addedBy.email": email};
  if (bookId) {
    filter._id = new ObjectId(bookId);
  }
  const result = await booksCollection.deleteOne(filter)
  res.send(result);
})
app.patch('/my-books/:email',verifyToken, async(req, res)=>{
  const {email} = req.params;
  const {bookId, ...data} = req.body ?? {};
  delete data._id;
  delete data.addedBy;
  delete data.createdAt;
  const filter = {"addedBy.email": email};
  if (bookId) {
    filter._id = new ObjectId(bookId);
  }
  const result = await booksCollection.updateOne(
    filter,
    {$set: data},
  )
  res.send(result);
})
// borrows API
app.post("/borrows/:email", verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    const { bookId } = req.body ?? {};

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({
        success: false,
        message: "Invalid book ID.",
      });
    }

    const bookObjectId = new ObjectId(bookId);

    // Check whether the user already borrowed this book
    const existingBorrow = await borrowsCollection.findOne({
      bookId: bookObjectId,
      userEmail: email,
      status: "borrowed",
    });

    if (existingBorrow) {
      return res.status(400).send({
        success: false,
        message: "You have already borrowed this book.",
      });
    }

    // Decrease available copies
    const updateResult = await booksCollection.updateOne(
      {
        _id: bookObjectId,
        availableCopies: { $gt: 0 },
      },
      {
        $inc: { availableCopies: -1 },
        $set: { updatedAt: new Date() },
      }
    );

    if (updateResult.matchedCount === 0) {
      return res.status(400).send({
        success: false,
        message: "Book not found or currently unavailable.",
      });
    }

    // Get book information
    const book = await booksCollection.findOne({
      _id: bookObjectId,
    });

    // Create borrow record
    const borrowData = {
      bookId: bookObjectId,
      userEmail: email,

      bookInfo: {
        title: book.title,
        author: book.author,
        image: book.image,
      },

      borrowedAt: new Date(),
      returnedAt: null,
      status: "borrowed",
    };

    const result = await borrowsCollection.insertOne(borrowData);

    res.status(201).send({
      success: true,
      message: "Book borrowed successfully.",
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to borrow book.",
    });
  }
});
app.get("/my-borrows/:email", verifyToken, async (req, res) => {
  try {
    const { email } = req.params;

    const result = await borrowsCollection
      .find({
        userEmail: email,
        status: "borrowed",
      })
      .sort({ borrowedAt: -1 })
      .toArray();

    res.send({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: "Failed to get borrowed books.",
    });
  }
});
app.patch(
  "/my-borrows/:email/:borrowId",
  verifyToken,
  async (req, res) => {
    try {
      const { email, borrowId } = req.params;

      if (!ObjectId.isValid(borrowId)) {
        return res.status(400).send({
          success: false,
          message: "Invalid borrow ID.",
        });
      }

      const borrowObjectId = new ObjectId(borrowId);

      // Find active borrow record
      const borrow = await borrowsCollection.findOne({
        _id: borrowObjectId,
        userEmail: email,
        status: "borrowed",
      });

      if (!borrow) {
        return res.status(404).send({
          success: false,
          message: "Borrow record not found or already returned.",
        });
      }

      // Update borrow status
      const returnResult = await borrowsCollection.updateOne(
        {
          _id: borrowObjectId,
          userEmail: email,
          status: "borrowed",
        },
        {
          $set: {
            status: "returned",
            returnedAt: new Date(),
          },
        }
      );

      if (returnResult.modifiedCount !== 1) {
        return res.status(400).send({
          success: false,
          message: "Book could not be returned.",
        });
      }

      // Increase available copies
      await booksCollection.updateOne(
        { _id: borrow.bookId },
        {
          $inc: { availableCopies: 1 },
          $set: { updatedAt: new Date() },
        }
      );

      res.send({
        success: true,
        message: "Book returned successfully.",
      });
    } catch (error) {
      res.status(500).send({
        success: false,
        message: "Failed to return book.",
      });
    }
  }
);




app.listen(PORT, ()=>{
  console.log(`server is running on port ${PORT}`);
})

export default app;
