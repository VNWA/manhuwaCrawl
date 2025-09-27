import fs from "fs";

export class Logger {
  static info(message: string) {
    console.log(`ℹ️ ${message}`);
  }

  static success(message: string) {
    console.log(`✅ ${message}`);
  }

  static error(message: string) {
    console.error(`❌ ${message}`);
    fs.appendFileSync("errors.log", message + "\n");
  }
}
