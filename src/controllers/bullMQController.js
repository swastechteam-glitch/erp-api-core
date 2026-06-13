import { getPool } from "../config/dynamicDB.js";
import { notificationJob } from "../queue/producer.js";

export const testBullMQ = async (req, res) => {
  try {
    // const pool = await getPool(req.headers.subdbname); // from middleware
     await notificationJob({ message: "Test queue message", Name: "Anbu", id: 1,  });
     res.json({ status: "Job added" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
