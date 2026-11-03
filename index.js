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



app.get('/', ( req, res)=>{
  res.send("Welcome to booknook server")
})
app.post('/add-books',verifyToken, async(req, res)=>{
  const data = req.body;
  const result = await booksCollection.insertOne(data);
  res.send(result);
})
app.get('/all-books',verifyToken, async(req, res)=>{
  const result = await booksCollection.find({}).sort({createdAt: -1}).toArray();
  res.send(result);
})
app.get('/all-books/:id',verifyToken, async(req, res)=>{
  const {id} = req.params;
  const result = await booksCollection.findOne({_id: new ObjectId(id)})
  res.send(result)
})
app.get('/arrival-books',verifyToken, async(req, res)=>{
  const result = await booksCollection.find({}).sort({createdAt: -1}).limit(6).toArray();
  res.send(result);
})
app.get('/my-books/:email',verifyToken, async(req, res)=>{
  const {email} = req.params;
  const result = await booksCollection.find({"addedBy.email": email}).toArray();
  res.send(result)
})






app.listen(PORT, ()=>{
  console.log(`server is running on port ${PORT}`);
})

export default app;
