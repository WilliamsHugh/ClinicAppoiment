import { createGatewayApp } from "./app.js";
import { loadGatewayConfig } from "./config.js";

const config = loadGatewayConfig();
const app = createGatewayApp({ config });

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "info", event: "gateway.started", port: config.port }));
});
