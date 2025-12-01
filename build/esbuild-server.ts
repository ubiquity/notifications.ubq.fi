import esbuild from "esbuild";
import { esBuildContext } from "./esbuild-build";
(async () => {
  await server();
})().catch((error) => {
  console.error("Unhandled error:", error);
  process.exit(1);
});
export async function server() {
  const _context = await esbuild.context(esBuildContext);
  // Enable watch mode so builds re-run on file changes during development
  await _context.watch();
  const preferredPort = Number(process.env.PORT) || 8080;

  const { port } = await _context.serve({
    servedir: "static",
    port: preferredPort,
    host: "0.0.0.0",
  });

  const os = await import("os");
  const networkInterfaces = os.networkInterfaces();
  const lanIp = Object.values(networkInterfaces)
    .flat()
    .find((iface) => iface && iface.family === "IPv4" && !iface.internal)?.address;

  if (lanIp) {
    console.log(`Accessible on the network at http://${lanIp}:${port}`);
  } else {
    console.log("Could not determine LAN IP address.");
  }

  console.log(`Server is running at http://localhost:${port}`);
  console.log("Watching for changes...\n");
}
