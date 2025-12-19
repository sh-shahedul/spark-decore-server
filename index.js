const express = require("express");
const cors = require("cors");
const app = express();
require("dotenv").config();
const port = process.env.PORT || 3000;

//create traniction
const crypto = require("crypto");
const admin = require("firebase-admin");

const serviceAccount = require("./firebase-admin-sdk-sparkdecore.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
function generateTrackingId() {
  const prefix = "PRCL";
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${prefix}-${date}-${random}`;
}

// middle ware
app.use(cors());
app.use(express.json());

//==========================
 //verify firebase token JWT
const verifyFirebaseToken = async (req,res,next)=>{
    console.log('headers in the middleware', req.headers.authorization);

     if(!req.headers.authorization){
        return res.status(401).send({message:'Unauthorized Access'})
      }
      const token = req.headers.authorization.split(" ")[1]
      if(!token){
         return res.status(401).send({message:'Unauthorized Access'})
      } 

      try{
      const decoded = await admin.auth().verifyIdToken(token)
      console.log('after decoded in the token',decoded)
      req.decoded_email = decoded.email
      next() 
      }
      catch(eror){
         return res.status(401).send({message:'Unauthorized Access'})
      }
    
  
 }



 //===================
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

    //middleware admin  with database access 
    const verifyAdmin = async(req,res,next) =>{
    const email = req.decoded_email;
     const query = {email}
     const user = await userCollection.findOne(query)
      if(!user || user.role !== 'admin' ){
        return res.status(403).send({message:'Forbidden Access'})
      }
      
      next()
    }
     //middleware decorator  with database access 
    const verifyDecorator = async(req,res,next) =>{
    const email = req.decoded_email;
     const query = {email}
     const user = await userCollection.findOne(query)
      if(!user || user.role !== 'decorator' ){
        return res.status(403).send({message:'Forbidden Access'})
      }
      
      next()
    }
     //middleware user  with database access 
    const verifyUser = async(req,res,next) =>{
    const email = req.decoded_email;
     const query = {email}
     const user = await userCollection.findOne(query)
      if(!user || user.role !== 'user' ){
        return res.status(403).send({message:'Forbidden Access'})
      }
      
      next()
    }


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

    // Get Top Decorators by rating (descending)
     app.get("/users/decorators/top", async (req, res) => {
     try {
    // Fetch top 10 active decorators sorted by rating
    const topDecorators = await userCollection
      .find({ role: "decorator", status: "active" })
      .sort({ rating: -1 }) 
      .limit(10)
      .toArray();
  
    res.send(topDecorators);
  } catch (error) {
    console.error("Failed to fetch top decorators:", error);
    res.status(500).send({ error: "Failed to fetch top decorators" });
  }
});


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
 

  //calulate  profile completition
const calculateProfileCompletion = (user) => {
  let percentage = 0;

  if (user.displayName) percentage += 20;
  if (user.photoURL) percentage += 20;
  if (user.location) percentage += 15;
  if (user.phoneNumber) percentage += 15;
  if (user.bioData) percentage += 30;

  return percentage;
};

// Get logged in user profile
app.get("/users/profile", verifyFirebaseToken, async (req, res) => {
  const email = req.decoded_email;

  const user = await userCollection.findOne({ email });

  if (!user) {
    return res.status(404).send({ message: "User not found" });
  }

  const profileCompletion = calculateProfileCompletion(user);

  res.send({
    ...user,
    profileCompletion,
  });
});

  // Update logged in user profile
app.patch("/users/profile", verifyFirebaseToken, async (req, res) => {
  const email = req.decoded_email;

  const {
    displayName,
    photoURL,
    location,
    phoneNumber,
    bioData,
  } = req.body;

  const updatedUser = {
    displayName,
    photoURL,
    location,
    phoneNumber,
    bioData,
    updatedAt: new Date(),
  };

  const profileCompletion = calculateProfileCompletion(updatedUser);

  const result = await userCollection.updateOne(
    { email },
    {
      $set: {
        ...updatedUser,
        profileCompletion,
      },
    }
  );

  res.send({
    success: true,
    profileCompletion,
    result,
  });
});

    // make user to decorator
    app.patch("/users/:id/role", async (req, res) => {
  const { id } = req.params;
  const filter = { _id: new ObjectId(id) };

  const updateDoc = {
    $set: { role: "decorator" }
  };

  const result = await userCollection.updateOne(filter, updateDoc);
  res.send({ message: "User  to decorator", result });
});

  //  decorator enable /disable
app.patch("/users/decorator-status/:id", verifyFirebaseToken, async (req, res) => {
  const id = req.params.id;
  const { status } = req.body; 

  const filter = { _id: new ObjectId(id) };
  const update = {
    $set: { status }
  };

  const result = await userCollection.updateOne(filter, update);
  res.send(result);
});

//=============================
// Assign decorator to a booking
app.patch("/bookings/:id/assign-decorator",verifyFirebaseToken, async (req, res) => {
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
          assignedDecoatorStatus:'assigned',
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
app.get("/users/decorators/active", verifyFirebaseToken, async (req, res) => {
  try {
    const decorators = await userCollection.find({ role: "decorator", status: "active" }).toArray();
    res.send(decorators);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch decorators" });
  }
});

// create decorator
app.post("/decorators", verifyFirebaseToken,verifyAdmin, async (req, res) => {
  const { name, email, specialty, phone, rating } = req.body;
  if (!email || !specialty || !phone || !rating)  return res.send({ success: false, message: "Missing fields" });

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
        rating,
      },
    }
  );
  res.send({ success: true, message: "Decorator created", result });
});

// Update decorator
app.patch("/decorators/:id", async (req, res) => {
  const { id } = req.params;
  const { specialty, phone,rating } = req.body;
  const result = await userCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { specialty, phone,rating } }
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
      const cursor = serviceCollection.find().sort({ createdAt: -1 }).limit(8);
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
     app.patch("/services/:id",verifyFirebaseToken,verifyAdmin, async (req, res) => {
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
          description: data.description,  
          image: data.image,               
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
    app.post("/services",verifyFirebaseToken,verifyAdmin, async (req, res) => {
      const newService = req.body;
      const result = await serviceCollection.insertOne(newService);
      res.send(result);
    });

   //delete service
    app.delete("/services/:id", verifyFirebaseToken,verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await serviceCollection.deleteOne(query);
      res.send(result);
    });

    //  booking related api
    //specific 
    app.get("/bookings",verifyFirebaseToken, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.userEmail = email;
        //check email address 
        // if(email !==req.decoded_email){
        //   return res.status(403).send({message:'forbidden access'})
        // }
      }

      const cursor = bookingCollection.find(query).sort({ bookingDate: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
   //my assign service (decorator)
    app.get("/bookings/assignDecoratore", verifyFirebaseToken,verifyDecorator, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.assignedDecoratorEmail = email;
        //check email address 
        if(email !==req.decoded_email){
          return res.status(403).send({message:'forbidden access'})
        }
      }

      const cursor = bookingCollection.find(query).sort({ bookingDate: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });
  

    //  singel booking 
    app.get("/bookings/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.findOne(query);
      res.send(result);
    });
 
    // Today's schedule for decorator
  app.get("/bookings/decorator/today", verifyFirebaseToken,verifyDecorator, async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) {
      return res.status(400).send({ message: "Decorator email required" });
    }

    // Get today's date in Bangladesh timezone (UTC+6)
    const now = new Date();
    const bangladeshOffset = 6 * 60; // UTC+6 in minutes
    const localTime = new Date(now.getTime() + (bangladeshOffset * 60 * 1000));
    
    const year = localTime.getUTCFullYear();
    const month = String(localTime.getUTCMonth() + 1).padStart(2, '0');
    const day = String(localTime.getUTCDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`;

    const result = await bookingCollection.find({
      assignedDecoratorEmail: email,
      bookingDate: today,
      decoratorAssigned: true,
    }).sort({ bookingTime: 1 }).toArray();

    res.send(result);
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Failed to load today's schedule" });
  }
});

// Decorator Earnings summary
app.get("/bookings/decorator/earnings-detail", verifyFirebaseToken,verifyDecorator, async (req, res) => {
  try {
    const email = req.query.email;
    if (!email) return res.status(400).send({ error: "Decorator email required" });

    // Filter only completed + paid bookings for this decorator
    const bookings = await bookingCollection
      .find({
        assignedDecoratorEmail: email,
        paymentStatus: "paid",
        assignedDecoatorStatus: "completed",
      })
      .sort({ bookingDate: -1 })
      .toArray();

    const totalEarnings = bookings.reduce((sum, b) => sum + (b.totalCost || 0), 0);
    const today = new Date().toISOString().split("T")[0];
    const todayEarnings = bookings
      .filter(b => b.bookingDate === today)
      .reduce((sum, b) => sum + (b.totalCost || 0), 0);

    const totalCompletedProjects = bookings.length;

    res.send({
      totalEarnings,
      todayEarnings,
      totalCompletedProjects,
      bookings, 
    });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: "Failed to fetch earnings details" });
  }
});


    
  //  store booking 
    app.post("/bookings",verifyFirebaseToken, async (req, res) => {
      const newBook = req.body;
      const result = await bookingCollection.insertOne(newBook);
      res.send(result);
    });
      // update  booking
  app.patch("/bookings/:id",verifyFirebaseToken,verifyUser, async (req, res) => {
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

    // update service status 
app.patch("/bookings/:id/update-decorator-status",verifyFirebaseToken, verifyDecorator, async (req, res) => {
  const { status, decoratorEmail } = req.body;
  const STATUS_FLOW = ["assigned","planning","materials-prepared","on-the-way","setup-in-progress","completed"];

  const booking = await bookingCollection.findOne({
    _id: new ObjectId(req.params.id),
    assignedDecoratorEmail: decoratorEmail
  });
  if (!booking) return res.status(404).send({ message: "Not found" });

  const currentIndex = STATUS_FLOW.indexOf(booking.assignedDecoatorStatus);
  if (STATUS_FLOW[currentIndex+1] !== status)
    return res.status(400).send({ message: `Next allowed: ${STATUS_FLOW[currentIndex+1]}` });

  await bookingCollection.updateOne(
    { _id: new ObjectId(req.params.id) },
    { $set: { assignedDecoatorStatus: status } }
  );

  res.send({ success: true, message: "Status updated" });
});



    //  delete booking
    app.delete("/bookings/:id",verifyFirebaseToken, verifyUser, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingCollection.deleteOne(query);
      res.send(result);
    });

    //  payemnt method
    app.get("/payments",verifyFirebaseToken, verifyUser, async (req, res) => {
      const email = req.query.email;
      const query = {};
      if (email) {
        query.customerEmail = email;
        //check email address 
        if(email !==req.decoded_email){
          return res.status(403).send({message:'forbidden access'})
        }
      }
      const cursor = paymentCollection.find(query).sort({ paidAt: -1 });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/create-checkout-session",verifyFirebaseToken, async (req, res) => {
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
      // console.log(session);
      res.send({ url: session.url });
    });

    app.patch("/payment-success",verifyFirebaseToken, async (req, res) => {
      try {
        const sessionId = req.query.session_id;
        if (!sessionId) {
          return res.status(400).send({ error: "Missing session ID" });
        }

        // Retrieve Stripe session
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transactionId = session.payment_intent;

        //  Check if this transaction already exists BEFORE doing anything else
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

        //  Payment must be completed
        if (session.payment_status !== "paid") {
          return res.send({ success: false, message: "Payment not completed" });
        }

        //  Generate tracking ID
        const trackingId = generateTrackingId();

        //  Update booking status
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

        // Create payment document
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

        // Insert payment atomically (DB will prevent duplicates)
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

          throw err; 
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
app.get("/admin/analytics", verifyFirebaseToken,verifyAdmin, async (req, res) => {
  try {
    // only paid payments
    const payments = await paymentCollection.find({ paymentStatus: "paid" }).toArray();

    //  Total Revenue
    const totalRevenue = payments.reduce( (sum, p) => sum + Number(p.amount),0);

    //  Monthly Revenue
    const monthMap = {};
     payments.forEach((p) => {
      const month = new Date(p.paidAt).toLocaleString("en-US", {
        month: "short",
        year: "numeric",
      });
      monthMap[month] = (monthMap[month] || 0) + Number(p.amount);
    });

    const monthlyRevenue = Object.entries(monthMap).map(
      ([month, revenue]) => ({ month, revenue })
    );

    //  Service Demand 
    const serviceDemandMap = {};
    payments.forEach((p) => {
      serviceDemandMap[p.serviceName] =
        (serviceDemandMap[p.serviceName] || 0) + 1;
    });

    const serviceDemand = Object.entries(serviceDemandMap).map(
      ([service, count]) => ({ service, count })
    );

    // bookings per user
    const userBookingMap = {};
    payments.forEach((p) => {
      userBookingMap[p.customerEmail] =
        (userBookingMap[p.customerEmail] || 0) + 1;
    });

    const bookingsHistogram = Object.entries(userBookingMap).map(
      ([user, count]) => ({ user, count })
    );

    res.json({
      totalRevenue,
      monthlyRevenue,
      serviceDemand,
      bookingsHistogram,
    });
  } catch (error) {
    console.error("Analytics Error:", error);
    res.status(500).json({ message: "Failed to load analytics" });
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
