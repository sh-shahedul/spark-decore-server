const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const port =process.env.PORT ||3000
// middle ware 
app.use(cors())
app.use(express.json())


const { MongoClient, ServerApiVersion } = require('mongodb');
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
  
     //Service related api
         app.get('/services',async(req,res)=>{
             const cursor = serviceCollection.find().sort({createdAt:-1}).limit(8);
             const result= await cursor.toArray()
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