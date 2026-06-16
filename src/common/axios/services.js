import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

// Where the other services live.
const serviceUrls = {
  core: process.env.CORE_URL || 'http://localhost:9001',
  ai: process.env.AI_URL || 'http://localhost:9002',
};

// The axios call function: call another service and return its response.
// Used by the gateway to forward, and by any service that needs to call
// another (e.g. the AI service fetching data from core).
export const axiosRequest = async (service, { method = 'GET', endpoint, data, headers = {} }) => {
  const res = await axios({
    baseURL: serviceUrls[service],
    method,
    url: endpoint,
    data: ['GET', 'HEAD'].includes((method || 'GET').toUpperCase()) ? undefined : data,
    headers,
    responseType: 'arraybuffer', // works for JSON and PDF/binary
    validateStatus: () => true,
    timeout: 60000,
  });
  return { status: res.status, data: res.data, headers: res.headers };
};
