import * as fs from "fs";

export class Logger {
  static info(message: string) {
    console.log(`\x1b[34m[INFO]\x1b[0m ${message}`); // xanh dương
  }

  static success(message: string) {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m ${message}`); // xanh lá
  }

  static warn(message: string) {
    console.warn(`\x1b[33m[WARN]\x1b[0m ${message}`); // vàng
  }

  static error(message: string) {
    console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`); // đỏ
    fs.appendFileSync("errors.log", `[ERROR] ${message}\n`);
  }
}
