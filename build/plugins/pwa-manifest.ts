import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIST = `../../static/dist`;
const pluginDir = path.dirname(fileURLToPath(import.meta.url));
type WebManifest = { icons: { src: string }[] };

export const pwaManifest: esbuild.Plugin = {
  name: "pwa-manifest",
  setup(build) {
    build.onEnd(() => {
      const manifestPath = path.resolve(pluginDir, "../../static/manifest.json");
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as WebManifest;

      // Update the icon paths
      manifest.icons.forEach((icon) => {
        const filename = path.basename(icon.src);
        const hashedFilename = fs.readdirSync(path.resolve(pluginDir, DIST)).find((file) => file.startsWith(filename.split(".")[0]));

        // Update the icon src in the manifest
        if (hashedFilename) {
          icon.src = `/${hashedFilename}`;
        }
      });

      // Write the updated manifest to the output directory
      fs.writeFileSync(path.resolve(pluginDir, `${DIST}/manifest.json`), JSON.stringify(manifest, null, 2));
    });
  },
};
