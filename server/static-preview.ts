import express from "express";
import path from "node:path";

const app = express();
const port = Number(process.env.EXPO_PORT ?? 8081);
const webBuildDirectory = path.resolve(process.cwd(), "web-dist");

app.disable("x-powered-by");
app.use(express.static(webBuildDirectory, { extensions: ["html"], maxAge: 0 }));
app.get("*", (_request, response) => {
  response.sendFile(path.join(webBuildDirectory, "index.html"));
});

app.listen(port, () => {
  console.log(`[preview] Static web build is available on port ${port}`);
});
