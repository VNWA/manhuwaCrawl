// auto-crawl.ts
import { crawl } from "./crawl";
import { History } from "./utils/history";
import pLimit from "p-limit";

async function runAutoCrawl() {
    const history = new History();
    const autoUrls = await history.getAutoHistoryItems();

    if (autoUrls.length === 0) {
        console.log("Không có URL nào được đánh dấu auto crawl.");
        return;
    }

    const limit = pLimit(3); // chỉ chạy tối đa 3 request cùng lúc

    await Promise.all(
        autoUrls.map((item) =>
            limit(async () => {
                console.log(`Bắt đầu crawl: ${item.url}`);
                await crawl(item.url);
                console.log(`Đã crawl xong: ${item.url}`);
            })
        )
    );
}

runAutoCrawl().catch((err) => {
    console.error("Lỗi khi chạy auto crawl:", err);
});
