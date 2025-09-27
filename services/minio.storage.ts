import { config } from "dotenv";
import { Client } from "minio";
import { Readable } from "stream";
import fetch from "node-fetch";
import * as path from "path";
import https from "https";

config();

const endpointUrl = new URL(process.env.MINIO_ENDPOINT!);

const minioClient = new Client({
    endPoint: endpointUrl.hostname,
    port: Number(endpointUrl.port) || (endpointUrl.protocol === "https:" ? 443 : 80),
    useSSL: endpointUrl.protocol === "https:",
    accessKey: process.env.MINIO_ACCESS_KEY_ID!,
    secretKey: process.env.MINIO_SECRET_ACCESS_KEY!
});

const BUCKET = process.env.MINIO_BUCKET!;
const ROOT_FOLDER = process.env.MINIO_FORLDER ? `${process.env.MINIO_FORLDER}/` : "";

export class MinioStorage {
    private client: Client;
    private bucket: string;
    private rootFolder: string;

    constructor(client: Client, bucket: string, rootFolder: string) {
        this.client = client;
        this.bucket = bucket;
        this.rootFolder = rootFolder;
    }

    private fullPath(filePath: string) {
        return this.rootFolder + filePath;
    }

    private currentDayFolder(): string {
        const now = new Date();
        const day = now.getDate().toString().padStart(2, "0");
        const month = (now.getMonth() + 1).toString().padStart(2, "0");
        const year = now.getFullYear();
        return `${day}-${month}-${year}/`;
    }

    private async ensureFolder(folder: string) {
        if (!folder) return;
        const stream = this.client.listObjectsV2(this.bucket, folder, true);
        for await (const _ of stream) return;
        await this.client.putObject(this.bucket, folder, Buffer.from(""));
    }

    /** Upload file luôn trong folder ngày */
    async put(fileName: string, data: Buffer | string | Readable) {
        const dayFolder = this.currentDayFolder();
        await this.ensureFolder(this.fullPath(dayFolder));
        const finalPath = `${dayFolder}${fileName}`;
        await this.client.putObject(this.bucket, this.fullPath(finalPath), data);
        return this.url(finalPath);
    }

    /** Download từ URL và upload, bỏ kiểm tra SSL */
    async downloadFromUrl(url: string): Promise<string> {
        const ext = path.extname(new URL(url).pathname) || ".jpg";
        const filename = `${Date.now()}_${Math.floor(Math.random() * 10000)}${ext}`;

        const agent = new https.Agent({ rejectUnauthorized: false });
        const buffer = await (await fetch(url, { agent })).buffer();

        return this.put(filename, buffer);
    }

    url(filePath: string): string {
        return `${process.env.MINIO_ENDPOINT}/${this.bucket}/${this.fullPath(filePath)}`;
    }

    async files(): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
        const files: Array<{ name: string; size: number; lastModified: Date }> = [];
        const stream = this.client.listObjectsV2(this.bucket, this.rootFolder, false);
        for await (const obj of stream) {
            if (!obj.name || obj.size === 0 || obj.name.endsWith("/")) continue;
            files.push({
                name: obj.name,
                size: obj.size,
                lastModified: obj.lastModified || new Date(0)
            });
        }
        return files;
    }

    async allFiles(): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
        const files: Array<{ name: string; size: number; lastModified: Date }> = [];
        const stream = this.client.listObjectsV2(this.bucket, this.rootFolder, true);
        for await (const obj of stream) {
            if (!obj.name || obj.size === 0 || obj.name.endsWith("/")) continue;
            files.push({
                name: obj.name.replace(this.rootFolder, ""),
                size: obj.size,
                lastModified: obj.lastModified || new Date(0)
            });
        }
        return files;
    }

    async dirs(): Promise<string[]> {
        const folders: Set<string> = new Set();
        const stream = this.client.listObjectsV2(this.bucket, this.rootFolder, false);
        for await (const obj of stream) {
            if (!obj.name) continue;
            if (obj.name.endsWith("/")) folders.add(obj.name.replace(this.rootFolder, ""));
        }
        return Array.from(folders);
    }

    async allDirs(): Promise<string[]> {
        const folders: Set<string> = new Set();
        const stream = this.client.listObjectsV2(this.bucket, this.rootFolder, true);
        for await (const obj of stream) {
            if (!obj.name) continue;
            if (obj.name.endsWith("/")) folders.add(obj.name.replace(this.rootFolder, ""));
        }
        return Array.from(folders);
    }

    async delete(filePath: string) {
        return this.client.removeObject(this.bucket, this.fullPath(filePath));
    }

    async exists(filePath: string): Promise<boolean> {
        try {
            await this.client.statObject(this.bucket, this.fullPath(filePath));
            return true;
        } catch {
            return false;
        }
    }
}

export const Storage = new MinioStorage(minioClient, BUCKET, ROOT_FOLDER);
