import express from 'express';
import bodyParser from 'body-parser';
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import { Strategy } from "passport-local";
import session from "express-session";
import env from "dotenv";
import GoogleStrategy from "passport-google-oauth2";
import TwitterStrategy from "passport-twitter";
import axios from 'axios';

const app = express();  
const saltRounds = 10;

env.config();
app.use(
    session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: true,
      cookie: {
      }
    })
  );
  
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(passport.initialize());
app.use(passport.session());
async function checkEmailInLeakLookup(email) {
  const apiKey = '7eae09375ff3e99ddd7e6189c93989c0';  // Replace with your actual API key
  const url = 'https://leak-lookup.com/api/search';
  
  const data = {
    key: apiKey,
    type: 'email_address',
    query: email
  };
  let sites = []
  try {
    const response = await axios.post(url, data, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'  // Set content type for form data
      }
    });
    console.log(response.data.message)
    if(response.data.message == 'REQUEST LIMIT REACHED'){ return sites = ['free api limit reached'] }
    for (let key in response.data.message){
      sites.push(key)
    };
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data.message);
    } else {
      console.error('Error fetching data:', error.message);
    }
  }
  return sites
}

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect((err) => {
  if (err) {
    console.log("Connection Error", err);
    return;
  }
  console.log("Connected to Postgres");
});

app.get('/', (req, res) => {
    res.render('index.ejs');
});

app.get('/login', async (req, res) => {
    res.render('login.ejs');    
});

app.get('/signup', (req, res) => {
    res.render('signup.ejs');
});
app.get('/dashboard', async (req, res) => {
    if (req.isAuthenticated()) {
      let email  = req.user.email;
      let googledata = await db.query("SELECT * FROM googleinfo WHERE email = $1", [
        email,
      ])
      let sites = await checkEmailInLeakLookup(email);
      console.log(googledata.rows[0]);
      res.render("dashboard.ejs", {googledata:googledata.rows[0]
        ,sites:sites
      });
    }else{
        res.redirect("/login");
    }
        
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
      if (err) {
        return next(err);
      }
      res.redirect("/");
    });
  });
  app.get('/apps', async (req, res) => {
    if (req.isAuthenticated()) {
       let isGoogle = req.user.google=="done";
       console.log(isGoogle);
        res.render("apps.ejs", {isGoogle});
      } else {
        res.redirect("/login");
      }
});
app.post(
    "/login",
    passport.authenticate("local", {
      successRedirect: "/apps",
      failureRedirect: "/login",
    })
  );
  app.post("/signup", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
  
    try {
      const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
  
      if (checkResult.rows.length > 0) {
        req.redirect("/login");
      } else {
        bcrypt.hash(password, saltRounds, async (err, hash) => {
          if (err) {
            console.error("Error hashing password:", err);
          } else {
            const result = await db.query(
              "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
              [email, hash]
            );
            const user = result.rows[0];
            req.login(user, (err) => {
              console.log("success");
              res.redirect("/login");
            });
          }
        });
      }
    } catch (err) {
      console.log(err);
    }
  });
  app.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] })
  );
  app.get(
    "/auth/google/apps",
    passport.authenticate("google", {
      successRedirect: "/apps",
      failureRedirect: "/login",
    })
  );
  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: "http://localhost:3000/auth/google/apps",
        userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
      },
      async (accessToken, refreshToken, profile, cb) => {
        try {
          console.log(profile);
          await db.query("INSERT INTO googleinfo(name, email, familyName, photos) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET name = $1, email = $2,familyName = $3,photos = $4", [
            profile.name.givenName,
            profile.email,
            profile.name.familyName,
            profile.photos[0].value
          ])
          const result = await db.query("SELECT * FROM users WHERE email = $1", [
            profile.email,
          ]);
          if (result.rows.length >0) {
            const newUser = await db.query(
              "UPDATE users SET google = $1 WHERE email = $2 RETURNING *",
              ["done", profile.email]
            );
            return cb(null, newUser.rows[0]);
          } else {
            return cb(null, result.rows[0]);
          }
        } catch (err) {
          return cb(err);
        }
      }
    )
  );
  passport.use("local",
    new Strategy(async function verify(username, password, cb) {
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
          username,
        ]);
        if (result.rows.length > 0) {
          const user = result.rows[0];
          const storedHashedPassword = user.password;
          bcrypt.compare(password, storedHashedPassword, (err, valid) => {
            if (err) {
              //Error with password check
              console.error("Error comparing passwords:", err);
              return cb(err);
            } else {
              if (valid) {
                //Passed password check
                return cb(null, user);
              } else {
                //Did not pass password check
                return cb(null, false);
              }
            }
          });
        } else {
          return cb("User not found");
        }
      } catch (err) {
        console.log(err);
      }
    })
  );

  passport.serializeUser((user, cb) => {
    cb(null, user);
  });
  passport.deserializeUser((user, cb) => {
    cb(null, user);
  });

app.listen(3000, () => {
    console.log('Server started on port 3000');
})


