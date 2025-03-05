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
  const { port } = await _context.serve({
    servedir: "static",
    port: 8080,
    host: "0.0.0.0",
  });

  const os = await import("os");
  const networkInterfaces = os.networkInterfaces();
  const lanIp = Object.values(networkInterfaces)
    .flat()
    .find((iface) => iface && iface.family === "IPv4" && !iface.internal)?.address;

  console.log(`Server is running at http://localhost:${port}`);
  if (lanIp) {
    console.log(`Accessible on the network at http://${lanIp}:${port}`);
  } else {
    console.log("Could not determine LAN IP address.");
  }
}
