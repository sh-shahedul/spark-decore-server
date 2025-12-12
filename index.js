const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

//create traniction
const crypto = require("crypto");
function generateTrackingId() {
  const prefix = "PRCL";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${date}-${random}`;
}

// middle ware
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.STRIPE_SECRETE);
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.wbmojlp.mongodb.net/?appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // collection  db
    const db = client.db("spark_decore");
    const serviceCollection = db.collection("services");
    const userCollection = db.collection("users");
    const bookingCollection = db.collection("bookings");
    const paymentCollection = db.collection("payments");
    //create index
    await paymentCollection.createIndex({ transactionId: 1 }, { unique: true });

    //  user releted api

    app.get('/users',async(req,res)=>{
      const cursor = userCollection.find()
      const result = await cursor.toArray();
      res.send(result);
    })
    //querey email
    app.get("/users/email", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.email = email;
      }
      const cursor = userCollection.findOne(query);
      const result = await cursor;
      res.send(result);
    });


//     // Get all active decorators
//     app.get("/users/decorators", async (req, res) => {
//   try {
//     const decorators = await userCollection
//       .find({ role: "decorator", status: "active" }) 
//       .toArray();
//     res.send(decorators);
//   } catch (err) {
//     console.error(err);
//     res.status(500).send({ error: "Failed to fetch decorators" });
//   }
// });

    // User store in Database
    app.post("/users", async (req, res) => {
      const user = req.body;
      const exist = await userCollection.findOne({ email: user.email });
      if (exist) {
        return res.send({ message: "user exist" });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Promote user to decorator
    app.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const filter = { _id: new ObjectId(id) };

  const updateDoc = {
    $set: { role: "decorator" }
  };

  const result = await userCollection.updateOne(filter, updateDoc);
  res.send({ message: "User promoted to decorator", result });
});

  //  decorator enable /disable
app.patch("/users/decorator-status/:id", async (req, res) => {
  const id = req.params.id;
  const { status } = req.body; // active / disabled

  const filter = { _id: new ObjectId(id) };
  const update = {
    $set: { status }
  };

  const result = await userCollection.updateOne(filter, update);
  res.send(result);
});

//=============================
// Assign decorator to a booking
// Assign decorator directly as fields (no object, no photo)
app.patch("/bookings/:id/assign-decorator", async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { decoratorId } = req.body;

    if (!decoratorId) {
      return res.status(400).send({ success: false, message: "Decorator ID required" });
    }

    // Fetch decorator info
    const decorator = await userCollection.findOne({ 
      _id: new ObjectId(decoratorId), 
      role: "decorator", 
      status: "active" 
    });

    if (!decorator) {
      return res.status(404).send({ success: false, message: "Decorator not found or inactive" });
    }

    // Update booking with direct fields
    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(bookingId) },
      {
        $set: {
          assignedDecoratorId: decorator._id,
          assignedDecoratorName: decorator.name,
          assignedDecoratorEmail: decorator.email,
          assignedDecoratorSpecialty: decorator.specialty,
          decoratorAssigned: true,
        },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ success: false, message: "Booking not found" });
    }

    res.send({ success: true, message: "Decorator assigned successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Internal server error" });
  }
});

//==========================
// Get all active decorators
app.get("/users/decorators/active", async (req, res) => {
  try {
    const decorators = await userCollection.find({ role: "decorator", status: "active" }).toArray();
    res.send(decorators);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch decorators" });
  }
});

// Add decorator
app.post("/decorators", async (req, res) => {
  const { name, email, specialty, phone } = req.body;
  if (!email || !specialty || !phone)
    return res.send({ success: false, message: "Missing fields" });

  const user = await userCollection.findOne({ email });
  if (!user) return res.send({ success: false, message: "User not found" });

  const result = await userCollection.updateOne(
    { email },
    {
      $set: {
        role: "decorator",
        name,
        specialty,
        phone,
        status: "active",
        rating: 0,
      },
    }
  );
  res.send({ success: true, message: "Decorator created", result });
});

// Update decorator
app.patch("/decorators/:id", async (req, res) => {
  const { id } = req.params;
  const { specialty, phone } = req.body;
  const result = await userCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { specialty, phone } }
  );
  res.send({ success: true, modifiedCount: result.modifiedCount });
});

// Delete decorator
app.delete("/decorators/:id", async (req, res) => {
  const { id } = req.params;
  const result = await userCollection.deleteOne({ _id: new ObjectId(id) });
  if (result.deletedCount > 0)
    res.send({ success: true, message: "Decorator deleted" });
  else res.send({ success: false, message: "Decorator not found" });
});

    //Service related api

    //  all service
    app.get("/services/all", async (req, res) => {
      const cursor = serviceCollection.find().sort({ createdAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    // latest service
    app.get("/services", async (req, res) => {
      const cursor = serviceCollection.find().sort({ createdAt: -1 }).limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    //  singel service for details
    app.get("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.findOne(query);
      res.send(result);
    });

    //  update service
     app.patch("/services/:id", async (req, res) => {
    try {
      const id = req.params.id;
      const data = req.body;

      
      if (data.cost) data.cost = parseFloat(data.cost);

      const updateDoc = {
        $set: {
          service_name: data.service_name,
          service_category: data.service_category,
          cost: data.cost,
          unit: data.unit,
        },
      };

      const result = await serviceCollection.updateOne(
        { _id: new ObjectId(id) },
        updateDoc
      );

      res.send(result); 
    } catch (err) {
      console.error(err);
      res.status(500).send({ error: "Failed to update service" });
    }
  });


    //  add service
    app.post("/services", async (req, res) => {
      const newService = req.body;
      const result = await serviceCollection.insertOne(newService);
      res.send(result);
    });

   //delete service
    app.delete("/services/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.deleteOne(query);
      res.send(result);
    });

    //  booking related api
    //specific history
    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.userEmail = email;
      }

      const cursor = bookingCollection.find(query).sort({ bookingDate: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

  

    //  singel booking 
    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });
 

    
  //  store booking 
    app.post("/bookings", async (req, res) => {
      const newBook = req.body;
      const result = await bookingCollection.insertOne(newBook);
      res.send(result);
    });
      // update  booking
      app.patch("/bookings/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const { serviceType, bookingDate, bookingTime, location } = req.body;

    if (!serviceType || !bookingDate || !bookingTime || !location) {
      return res.status(400).send({ error: "All fields are required" });
    }

    const updateDoc = {
      $set: { serviceType, bookingDate, bookingTime, location },
    };

    const result = await bookingCollection.updateOne(
      { _id: new ObjectId(id) },
      updateDoc
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({ error: "Booking not found or no changes made" });
    }

    res.send({ success: true, modifiedCount: result.modifiedCount });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to update booking" });
  }
});


    //  delete booking
    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    //  payemnt method
    app.get("/payments", async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/create-checkout-session", async (req, res) => {
      const paymentInfo = req.body;
      const ammount = parseInt(paymentInfo.cost);
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              unit_amount: ammount,
              product_data: {
                name: paymentInfo.serviceName,
              },
            },
            quantity: 1,
          },
        ],
        customer_email: paymentInfo.userEmail,
        mode: "payment",
        metadata: {
          serviceId: paymentInfo.serviceId,
          serviceName: paymentInfo.serviceName,
          bookingId: paymentInfo.bookingId,
        },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });
      console.log(session);
      res.send({ url: session.url });
    });

    // app.patch('/payment-success',async(req,res)=>{
    //    const sessionId = req.query.session_id
    //   //  console.log("session id",sessionId);

    //   // duplicate handel  payment

    //    const session = await stripe.checkout.sessions.retrieve(sessionId)
    //     //  console.log('session retrive' , session);
    //      const trackingId =  generateTrackingId()
    //     if(session.payment_status === 'paid'){
    //      const id = session.metadata.bookingId;
    //      const query = { _id : new ObjectId(id)}
    //      const  update =  {
    //       $set :{
    //         bookingStatus : 'paid',
    //         trackingId: trackingId
    //       }
    //      }
    //     //  console.log(update,query)
    //       const result = await bookingCollection.updateOne(query,update)
    //        //=========
    //         const transactionId = session.payment_intent
    //   const query2 ={transactionId : transactionId}
    //   const paymentExist = await paymentCollection.findOne(query2)
    //   // console.log(paymentExist);
    //   if(paymentExist){
    //     return res.send({
    //       message: 'already exists',
    //       transactionId,
    //       trackingId : paymentExist.trackingId
    //     })
    //   }
    //   //========
    //      const payment = {
    //       ammount: session.amount_total,
    //       currency: session.currency,
    //       customerEmail: session.customer_email,
    //       serviceId: session.metadata.serviceId,
    //       serviceName: session.metadata.serviceName,
    //       transactionId: session.payment_intent,
    //       paymentStatus: session.payment_status,
    //       paidAt: new Date (),
    //       // trackingId:trackingId
    //      }
    //      if(session.payment_status === 'paid'){
    //         //  const resultpayment =  await paymentCollection.insertOne(payment)
    //         //  res.send({success:true,
    //         //   modifyService: result,
    //         //   trackingId:trackingId,
    //         //   transactionId:session.payment_intent,
    //         //   paymentInfo: resultpayment
    //         // })
    //      }

    //     // return  res.send(result)
    //     }
    //    res.send({success:false})
    // })

    app.patch("/payment-success", async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ error: "Missing session ID" });
        }

        // Retrieve Stripe session
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transactionId = session.payment_intent;

        // 1️⃣ Check if this transaction already exists BEFORE doing anything else
        const existingPayment = await paymentCollection.findOne({
          transactionId,
        });
        if (existingPayment) {
          return res.send({
            success: true,
            message: "Payment already processed",
            transactionId: existingPayment.transactionId,
            trackingId: existingPayment.trackingId,
          });
        }

        // 2️⃣ Payment must be completed
        if (session.payment_status !== "paid") {
          return res.send({ success: false, message: "Payment not completed" });
        }

        // 3️⃣ Generate tracking ID
        const trackingId = generateTrackingId();

        // 4️⃣ Update booking status
        const bookingId = session.metadata.bookingId;

        await bookingCollection.updateOne(
          { _id: new ObjectId(bookingId) },
          {
            $set: {
               paymentStatus: "paid",
               bookingStatus: "paid",
               trackingId: trackingId,
            },
          }
        );

        // 5️⃣ Create payment document
        const payment = {
          amount: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_email,
          serviceId: session.metadata.serviceId,
          serviceName: session.metadata.serviceName,
          transactionId: transactionId,
          paymentStatus: session.payment_status,
          paidAt: new Date(),
          trackingId: trackingId,
        };

        // 6️⃣ Insert payment atomically (DB will prevent duplicates)
        try {
          await paymentCollection.insertOne(payment);

          return res.send({
            success: true,
            transactionId,
            trackingId,
          });
        } catch (err) {
          // Handle Mongo duplicate key error
          if (err.code === 11000) {
            const existing = await paymentCollection.findOne({ transactionId });

            return res.send({
              success: true,
              message: "Payment already stored",
              transactionId,
              trackingId: existing.trackingId,
            });
          }

          throw err; // Some other DB error
        }
      } catch (error) {
        console.error("Payment processing error:", error);
        return res.status(500).send({
          success: false,
          error: "Internal server error",
          details: error.message,
        });
      }
    });


     // Admin Revenue Route
    app.get("/admin/revenue", async (req, res) => {
      try {
        const payments = await paymentCollection
          .find({ paymentStatus: "paid" })
          .sort({ paidAt: -1 })
          .toArray();

        // Total Revenue
        const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);

        // Monthly Revenue
        const monthMap = {};
        payments.forEach((p) => {
          const month = new Date(p.paidAt).toLocaleString("default", { month: "short", year: "numeric" });
          if (!monthMap[month]) monthMap[month] = 0;
          monthMap[month] += p.amount;
        });
        const monthlyRevenue = Object.keys(monthMap).map((month) => ({ month, revenue: monthMap[month] }));

        res.json({ totalRevenue, monthlyRevenue, payments });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch revenue data" });
      }
    });




    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("spark decore is runnung");
});

app.listen(port, () => {
  console.log(`spark decore is runnungon port ${port}`);
});
