const express = require('express')
const cors = require('cors');
const app = express()
require('dotenv').config()
const port =process.env.PORT || 3000

const crypto = require("crypto");
function generateTrackingId() {
  const prefix = "PRCL"; // your brand prefix
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const random = crypto.randomBytes(3).toString("hex").toUpperCase(); // 6-char random hex

  return `${prefix}-${date}-${random}`;
}
// middle ware 
app.use(cors())
app.use(express.json())
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRETE);
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
        const paymentCollection = db.collection("payments")
        
  
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



      //  payemnt method  
   app.get('/payments',async(req,res)=>{
          const email = req.query.email
         const query ={}
         if(email){
          query.customerEmail = email
         }
         const cursor = paymentCollection.find(query).sort({paidAt:-1})
         const result = await cursor.toArray()
         res.send(result)
   })



      app.post('/create-checkout-session',async(req,res)=>{
         const paymentInfo = req.body
         const ammount = parseInt(paymentInfo.cost)
         const session = await stripe.checkout.sessions.create({
           line_items: [
         {
         price_data :{
             currency : 'USD',
             unit_amount : ammount,
             product_data : {
               name : paymentInfo.serviceName
             }
         }, 
        quantity: 1,
            },
         ],
               customer_email : paymentInfo.userEmail,
               mode: 'payment',
               metadata : {
                 serviceId :  paymentInfo.serviceId,
                 serviceName: paymentInfo.serviceName,
                 bookingId: paymentInfo.bookingId
               },
               success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
               cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
         })
         console.log(session);
         res.send({ url:session.url })
      })


      app.patch('/payment-success',async(req,res)=>{
         const sessionId = req.query.session_id
        //  console.log("session id",sessionId);


        // duplicate handel  payment 
        // const transactionId = session.payment_intent
        // const query ={transactionId : transactionId}
        // const paymentExist = await paymentCollection.findOne(query)
        // console.log(paymentExist);
        // if(paymentExist){
        //   return res.send({
        //     message: 'already exists',
        //     transactionId,
        //     // trackingId : paymentExist.trackingId
        //   })
        // }

         const session = await stripe.checkout.sessions.retrieve(sessionId) 
           console.log('session retrive' , session);
           const trackingId =  generateTrackingId()
          if(session.payment_status === 'paid'){
           const id = session.metadata.bookingId;
           const query = { _id : new ObjectId(id)}
           const  update =  {
            $set :{
              bookingStatus : 'paid',
              trackingId: trackingId
            }
           }
           console.log(update,query)
            const result = await bookingCollection.updateOne(query,update)

           const payment = {
            ammount: session.amount_total,
            currency: session.currency,
            customerEmail: session.customer_email,
            serviceId: session.metadata.serviceId,
            serviceName: session.metadata.serviceName,
            transactionId: session.payment_intent,
            paymentStatus: session.payment_status,
            paidAt: new Date (),
            // trackingId:trackingId
           }
           if(session.payment_status === 'paid'){
               const resultpayment =  await paymentCollection.insertOne(payment)
               res.send({success:true,
                modifyService: result,
                trackingId:trackingId,
                transactionId:session.payment_intent,
                paymentInfo: resultpayment
              })
           }


          // return  res.send(result)
          }
         res.send({success:false})
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