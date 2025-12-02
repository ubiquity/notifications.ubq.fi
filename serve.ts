import { serveDir } from "jsr:@std/http/file-server";

const root = Deno.env.get("STATIC_DIR") ?? "static/dist";

Deno.serve((req) => serveDir(req, { fsRoot: root, quiet: true }));
