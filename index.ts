// index.ts
import readline from "readline";
import { HistoryItem } from "./types/types";
import { History } from "utils/history";
import { crawl } from "crawl";

const history = new History();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
});

function menu() {
    console.log(`
=== QUẢN LÝ LỊCH SỬ CRAWL ===
1. Thêm URL
2. Xem tất cả
3. Xóa theo index
4. Xóa khoảng index
5. Tìm kiếm theo URL
6. Toggle auto crawl
0. Thoát
`);
}

function prompt() {
    rl.question("Chọn chức năng: ", handleChoice);
}

async function handleChoice(choice: string) {
    try {
        switch (choice.trim()) {
            case "1":
                rl.question("Nhập URL: ", async (url) => {
                    await history.create(url, true);
                    const regex = /^https:\/\/mangadistrict\.com\/title\/[^\/]+\/?$/;
                    if (!regex.test(url)) {
                        console.log(`URL không hợp lệ: ${url}`);

                    } else {
                        await crawl(url);
                    }


                    menu();
                    prompt();
                });
                break;

            case "2":
                const all = await history.getAll();
                if (all.length === 0) {
                    console.log("⚠️ Không có dữ liệu.");
                } else {
                    console.table(
                        all.map((item, i) => ({
                            index: i,
                            url: item.url,
                            auto: item.is_auto_crawled,
                        }))
                    );
                }
                menu();
                prompt();
                break;

            case "3":
                rl.question("Nhập index cần xóa: ", async (idx) => {
                    const index = parseInt(idx, 10);
                    const ok = await history.delete(index);
                    console.log(ok ? `✅ Đã xóa index ${index}` : "⚠️ Index không hợp lệ");
                    menu();
                    prompt();
                });
                break;

            case "4":
                rl.question("Nhập khoảng index (vd: 2-5): ", async (range) => {
                    const parts = range.split("-").map((x) => x.trim());
                    if (parts.length !== 2) {
                        console.log("⚠️ Sai định dạng. Ví dụ đúng: 2-5");
                        menu();
                        prompt();
                        return;
                    }

                    const start = Number(parts[0]);
                    const end = Number(parts[1]);

                    if (isNaN(start) || isNaN(end)) {
                        console.log("⚠️ Index phải là số.");
                        menu();
                        prompt();
                        return;
                    }

                    const ok = await history.deleteRange(start, end);
                    console.log(ok ? `✅ Đã xóa từ ${start} đến ${end}` : "⚠️ Khoảng không hợp lệ");

                    menu();
                    prompt();
                });
                break;


            case "5":
                rl.question("Nhập URL cần tìm: ", async (url) => {
                    const result = await history.find(url);
                    if (!result) {
                        console.log("⚠️ Không tìm thấy URL:", url);
                    } else {
                        console.log("✅ Tìm thấy:", result);
                    }
                    menu();
                    prompt();
                });
                break;

            case "6":
                rl.question("Nhập index cần toggle auto: ", async (idx) => {
                    const index = parseInt(idx, 10);
                    const all = await history.getAll();
                    const item = all[index];
                    if (!item) {
                        console.log("⚠️ Index không hợp lệ");
                    } else {
                        const newValue = !item.is_auto_crawled;
                        await history.setAutoCrawled(index, newValue);
                        console.log(`✅ Đã set auto = ${newValue} cho index ${index}`);
                    }
                    menu();
                    prompt();
                });
                break;

            case "0":
                console.log("👋 Thoát chương trình...");
                rl.close();
                process.exit(0);
                break;

            default:
                console.log("⚠️ Chức năng không hợp lệ!");
                menu();
                prompt();
        }
    } catch (err) {
        console.error("❌ Lỗi:", err);
        menu();
        prompt();
    }
}

menu();
prompt();
