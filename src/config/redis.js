// redis.js
import { Redis } from "ioredis";

const port = process.env.REDIS_PORT;
const host = process.env.REDIS_HOST;
const pass = process.env.REDIS_PASS;

 const connection = new Redis({
  host: "72.60.220.7", // your redis host
  port: 6379, // default redis port
  password: "Swastech@123",  // add if needed
});

export default  connection