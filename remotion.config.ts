// Render settings (https://remotion.dev/docs/config)
import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setCrf(18);
Config.setPixelFormat("yuv420p"); // Instagram / TikTok compatible
Config.setOverwriteOutput(true);
