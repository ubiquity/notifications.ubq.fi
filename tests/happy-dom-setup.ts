/**
 * Bun test preload: sets up happy-dom global environment
 * before any test file is loaded.
 */
import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register();
