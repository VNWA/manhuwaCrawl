// index.ts
import { crawl } from "./crawl";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Nhập URL manga (cách nhau dấu phẩy): ", async (input) => {
  try {
    const urls = input
      .split(",")
      .map((u) => u.trim())
      .filter((u) => u.length > 0);

    const regex = /^https:\/\/mangadistrict\.com\/title\/[^\/]+\/$/;

    for (const url of urls) {
      if (!regex.test(url)) {
        console.log(`URL không hợp lệ: ${url}`);
        continue;
      }
      console.log(`URL hợp lệ, crawling: ${url}`);
      await crawl(url);

      // Delay giữa các crawl để tránh bị block
      await new Promise((res) => setTimeout(res, 2000));
    }
  } catch (err: any) {
    console.error("Lỗi:", err.message);
  } finally {
    rl.close();
  }
});
