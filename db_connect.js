import 'dotenv/config'
import pkg from 'pg';
const { Client } = pkg;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false,
    },
})
client.connect(function (err) {
    if (err) throw err;
    console.log("DB connected");
});