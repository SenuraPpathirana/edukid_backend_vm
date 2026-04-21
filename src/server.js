import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 3000;
// Bind to 0.0.0.0 so the server is reachable from outside the VM
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Server running on ${HOST}:${PORT} [${process.env.NODE_ENV || 'development'}]`);
});


