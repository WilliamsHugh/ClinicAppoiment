import { createGatewayApp } from "./app.js";
import { loadGatewayConfig } from "./config.js";
import { logServiceEvent } from "@clinic/request-logging";

const config = loadGatewayConfig();
const app = createGatewayApp({ config });

app.listen(config.port, process.env.HOST ?? "0.0.0.0", () => {
  logServiceEvent("api-gateway", "info", "service.started", { port: config.port });
});
