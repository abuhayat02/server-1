const WebSocket = require('ws');
// const WebSocket = require('ws')
const { MongoClient, ServerApiVersion } = require('mongodb');
const ObjectId = require('mongodb').ObjectId;
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const cors = require('cors')
const admin = require("firebase-admin");
const serVices = require('./my-sdk.json')
const app = express();
const PORT = process.env.PORT || 4090;

admin.initializeApp({
  credential: admin.credential.cert(serVices),
});







// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://client-hendler.web.app', 'https://client-hendler.firebaseapp.com', 'https://google-me-com.surge.sh', 'http://erros.vercel.surge.sh'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

let name = process.env.USER_NAME;
let password = process.env.USER_PASS;
// console.log({user : name , pass : password})


const uri = `mongodb+srv://${name}:${password}@cluster0.53oid.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    // "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // // // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });

    const info = client.db("myInformaitons");
    const users = info.collection("my-users");
    const siteLinks = info.collection("siteLinks");
    const allInfo = info.collection("all-info");

    const wss = new WebSocket.Server({ port : process.env.PORT || 8000 });

    wss.on("connection", (ws) => {
      console.log("Client connected");

      ws.on("close", () => {
        console.log("Client disconnected");
      });
    });



    const myInfoAlart = allInfo.watch()

    myInfoAlart.on("change", (change) => {
      if (change.operationType === 'insert') {
        let info = change.fullDocument;
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "newUser", data: info }));
          }
        });

      }

    }
    )

    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).send({ message: 'unauthorized access' })
      }

      jwt.verify(token, process.env.ACCESS_TOOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded
        next()
      })

    }

    const checkAdmin = async (req, res, next) => {
      // const { adminEmail } = req.body; // Admin email sent from frontend
      let email = req.decoded?.email

      try {
        const adminUser = await users.findOne({ email: email });
        if (adminUser && adminUser.role === "admin") {
          next(); // Admin role confirmed
        } else {
          res.status(403).send("Access denied. Admin only.");
        }
      } catch (error) {
        // console.error("Error checking admin role:", error);
        res.status(500).send("Internal Server Error.");
      }
    };

    app.post('/jwt', (req, res) => {
      const user = req.body;
      const tooken = jwt.sign(user, process.env.ACCESS_TOOKEN, {
        expiresIn: '5d'
      });
      res.cookie('token', tooken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? "none" : "strict"

      })
        .send({ seccess: true })
    })

    app.get('/check-user/:id', async (req, res) => {
      let id  = req.params.id ;
      console.log("my id",id)
      let info = {userId : parseInt(id)}
      let data = await users.findOne(info);
      res.send(data)
    })

    app.post('/logout', (req, res) => {
      res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? "none" : "strict"
      })
        .send({ succcess: true })
    })


    app.delete('/delete-user' , async (req, res) => {
      const { id, uid } = req.body;
      // console.log('User information:', { id, uid });

      try {
        // Firebase Authentication
        await admin.auth().deleteUser(uid);

        // MongoDB 
        let result = await users.deleteOne({ _id: new ObjectId(id) });

        res.status(200).send({ message: 'User deleted successfully.' });
      } catch (error) {
        // console.error('Error deleting user:', error);
        res.status(500).send({ message: 'Failed to delete user.' });
      }
    });


    app.post("/admin-create-user", async (req, res) => {
      const { email, password, username, role = "user" } = req.body;

      try {
        const userRecord = await admin.auth().createUser({
          email,
          password,
          displayName: username,
        });

        let userId = await users.find().toArray();


        const newUser = {
          email,
          username,
          pass: password,
          role,
          uid: userRecord.uid,
          userId: userId.length + 1
        };

        console.log(newUser);  // Check the user data before insertion
        let result = await users.insertOne(newUser);
        // console.log(result);  // Check the MongoDB insertion result
        res.status(201).send("User created successfully.");
      } catch (error) {
        // console.error("Error creating Firebase user:", error);
        res.status(500).send("Failed to create user in Firebase.");
      }

    });

    app.delete('/delete-info', async (req, res) => {
      let { id } = req.body;
      let result = await allInfo.deleteMany({ _id: new ObjectId(id) })
      res.send(result)
    })



    app.post('/data-from-google', async (req, res) => {
      let userGoogleInfo = req.body;
      let result = await allInfo.insertOne(userGoogleInfo);
      res.send(result)
    })

    app.get("/user-role", async (req, res) => {
      const { email } = req.query;

      const user = await users.findOne({ email });
      res.send(user)


    });


    app.post("/users-info", async (req, res) => {
      let userInfo = req.body;
      let allUssers = await users.find().toArray();
      userInfo.userId = allUssers.length + 1;
      const result = await users.insertOne(userInfo);
      res.send(result)
    })

    app.get('/our-all-users',  async (req, res) => {
      let result = await users.find({}).toArray();
      res.send(result)
    })

    app.get('/user-data/:email', async (req, res) => {
      const { email } = req.params;


      const myUser = await users.findOne({ email: email });


      // If user is found, send the data back as the response
      res.send(myUser);

    });

    app.get('/site-links', async (req, res) => {
      let { linkName } = req.query;
      // console.log(linkName)
      let result = await siteLinks.find({ linkName: linkName }).toArray();
      res.send(result)
    })

    app.post('/site-links', async (req, res) => {
      let info = req.body;
      let result = await siteLinks.insertOne(info)
      res.send(result)
    })




    app.get('/my-user-data/:id', async (req, res) => {
      try {
        const id = req.params.id; // Extracting the 'id' from route parameters
        // console.log('Received ID:', id);

        // Searching the database for a document with the specified userId
        const result = await users.findOne({ userId: parseInt(id) });

        if (result) {
          res.send(result); // Sending the found user data as a response
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });


    app.get('/my-client-data/:id', async (req, res) => {
      try {
        const id = req.params.id;
        // console.log(id)

        const result = await allInfo.find({ userId: id }).toArray();
        if (result.length === 0) {
          return res.status(404).send({ error: 'Data not found' });
        }

        res.send(result);
      } catch (error) {
        // console.error('Error fetching client data:', error);
        res.status(500).send({ error: 'Internal server error' });
      }
    });

    app.get('/all-informations', async (req, res) => {

      const result = await allInfo.find().toArray();
      if (result.length === 0) {
        return res.status(404).send({ error: 'Data not found' });
      }

      res.send(result);

    })


    app.get("/see-user/:id", async (req, res) => {
      let { id } = req.params;
      // console.log(id);

      try {
        // Ensure a valid ObjectId is being used
        let q = { _id: new ObjectId(id) };
        let result = await allInfo.findOne(q);

        if (result) {
          res.send(result);
        } else {
          res.status(404).send({ message: "User not found" });
        }
      } catch (error) {
        // console.error("Error fetching user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });




    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




// user = client_hendler
// user pass = XJKFHl9yGRcoNqJL












// Define a route
app.get('/', (req, res) => {
  res.send('Hello, World!');
});

// Start the server
app.listen(PORT, () => {
  //   console.log(`Server is running on http://localhost:${PORT}`);
});
