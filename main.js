const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const db = require('./db');
const axios = require('axios');

const defaultRouter = require('./routes/router');
const apiRouter = require('./routes/api');
const loginRouter = require('./routes/login');

const app = express();
const PORT = 3000;

app.use(session({
    secret: 'secert',
    resave: false,
    saveUninitialized: false
}));

app.use(bodyParser.json());

app.use('/', defaultRouter);
app.use('/api', apiRouter);
app.use('/auth', loginRouter);

app.listen(PORT, () => {
    console.log(`Server is running on \"http://localhost:${PORT}\"`);
});

