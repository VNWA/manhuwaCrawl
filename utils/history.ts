import fs from "fs/promises";
import path from "path";
import { HistoryItem } from "types/types";

export class History {
    private filePath: string;

    constructor(fileName: string = "../urls.json") {
        this.filePath = path.resolve(process.cwd(), "data/urls.json");

        this.initFile();
    }

    private async initFile(): Promise<void> {
        try {
            const exists = await fs.stat(this.filePath).then(() => true).catch(() => false);
            if (!exists) {
                await this.write([]);
                return;
            }

            const data = JSON.parse(await fs.readFile(this.filePath, "utf-8"));
            if (!Array.isArray(data)) throw new Error("JSON không phải mảng");
            for (const item of data) {
                if (typeof item.url !== "string" || typeof item.is_auto_crawled !== "boolean") {
                    throw new Error("Cấu trúc JSON không hợp lệ");
                }
            }
        } catch (e) {
            console.error("urls.json sai cấu trúc hoặc lỗi đọc file, tạo mới:", e);
            await this.write([]);
        }
    }

    private async read(): Promise<HistoryItem[]> {
        try {
            const data = await fs.readFile(this.filePath, "utf-8");
            return JSON.parse(data) as HistoryItem[];
        } catch (e) {
            console.error("Error reading JSON:", e);
            return [];
        }
    }

    private async write(data: HistoryItem[]): Promise<void> {
        try {
            await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf-8");
        } catch (e) {
            console.error("Error writing JSON:", e);
        }
    }

    async create(url: string, isAutoCrawled: boolean = true): Promise<HistoryItem> {
        const data = await this.read();
        const exists = data.find(d => d.url === url);
        if (exists) return exists;

        const newItem: HistoryItem = { url, is_auto_crawled: isAutoCrawled };
        data.push(newItem);
        await this.write(data);
        return newItem;
    }

    async delete(index: number): Promise<boolean> {
        const data = await this.read();
        if (index < 0 || index >= data.length) return false;

        data.splice(index, 1);
        await this.write(data);
        return true;
    }

    async deleteRange(fromIndex: number, toIndex: number): Promise<boolean> {
        const data = await this.read();
        if (fromIndex < 0 || toIndex >= data.length || fromIndex > toIndex) return false;

        data.splice(fromIndex, toIndex - fromIndex + 1);
        await this.write(data);
        return true;
    }

    async find(url: string): Promise<{ index: number; item: HistoryItem } | null> {
        const data = await this.read();
        const index = data.findIndex(d => d.url === url);
        if (index === -1) return null;

        const item = data[index];
        if (!item) return null;
        return { index, item };
    }


    async getAll(): Promise<HistoryItem[]> {
        return this.read();
    }

    async getAutoHistoryItems(): Promise<HistoryItem[]> {
        return (await this.read()).filter(d => d.is_auto_crawled);
    }

    async setAutoCrawled(index: number, value: boolean): Promise<boolean> {
        const data = await this.read();
        const item = data[index];
        if (!item) return false;

        item.is_auto_crawled = value;
        await this.write(data);
        return true;
    }

    async resetAll(): Promise<void> {
        const data = (await this.read()).map(d => ({ ...d, is_auto_crawled: false }));
        await this.write(data);
    }
}
