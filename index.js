const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const port =process.env.PORT ||3000
// middle ware 
app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wbmojlp.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
        await client.connect();
     
        const db = client.db("spark_decore");
        const serviceCollection = db.collection("services");
        const userCollection = db.collection("users");
        const bookingCollection = db.collection("bookings")
        
  
        //  user releted api 
         
          // User Create in Database
        app.post("/users", async (req, res) => {
            const user = req.body;

            const exist = await userCollection.findOne({ email: user.email });

            if (exist) {
                return res.send({ message: "user exist" });
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });



     //Service related api

      //  all service 
       app.get('/services/all', async (req, res) => {
       const cursor = serviceCollection .find().sort({ createdAt: -1 });
       const result = await cursor.toArray();
       res.send(result);
         });


        // latest service 
         app.get('/services',async(req,res)=>{
             const cursor = serviceCollection.find().sort({createdAt:-1}).limit(6);
             const result= await cursor.toArray()
             res.send(result)
         })

        //  singel service for details 
         app.get('/services/:id',async(req,res)=>{
          const id = req.params.id
          const query = {_id : new ObjectId(id)}
          const result = await serviceCollection.findOne(query)
          res.send(result)
         })
            
      //  booking related api 
       app.get('/bookings',async(req,res)=>{
        const email = req.query.email
         const query ={}
         if(email){
          query.userEmail = email
         }

         const cursor = bookingCollection.find(query).sort({bookingDate:-1})
         const result = await cursor.toArray()
         res.send(result)
       })

       app.get('/bookings/:id',async(req,res)=>{
          const id = req.params.id
          const query = {_id : new ObjectId(id)}
          const result = await bookingCollection.findOne(query)
          res.send(result)
       })
       


        app.post('/bookings',async(req,res)=>{
          const newBook = req.body
          const result = await bookingCollection.insertOne(newBook)
          res.send(result)
        })

        //  delete booking 
        app.delete('/bookings/:id',async(req,res)=>{
          const id  =  req.params.id
          const query = {_id :new ObjectId(id)}
          const result = await bookingCollection.deleteOne(query)
          res.send(result)
        })






    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);








app.get('/', (req, res) => {
  res.send('spark decore is runnung')
})

app.listen(port, () => {
  console.log(`spark decore is runnungon port ${port}`)
})