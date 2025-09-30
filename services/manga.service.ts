import { PrismaClient } from "@prisma/client";
import { Logger } from "../utils/logger";
import { Storage } from "./minio.storage";
import pLimit from "p-limit";
import fetch from "node-fetch";
import { Readable } from "stream";
import moment from "moment-timezone";

const getNow = () => {
  return moment().tz("Asia/Ho_Chi_Minh").add(7, "hours").toISOString(true);
}; interface ChapterInput {
  title: string;
  images?: string[];
  view: number;
}

interface GenreInput {
  name: string;
  slug: string;
}

interface MangaInput {
  name: string;
  slug: string;
  other_name?: string;
  cover_url?: string;
  doujinshi?: string;
  pilot?: string;
  posted_by: number;
  chapters?: ChapterInput[];
  genres?: GenreInput[];
}

export class MangaService {
  private prisma: PrismaClient;
  private imageCache: Map<string, string>; // tạm cache url -> MinIO

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
    this.imageCache = new Map();
  }

  private getRndInteger(min: number, max: number) {
    return Math.floor(Math.random() * (max - min)) + min;
  }

  private async uploadImage(imgUrl: string): Promise<string | null> {
    if (this.imageCache.has(imgUrl)) return this.imageCache.get(imgUrl)!;

    try {
      const res = await fetch(imgUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const bufferStream = Readable.from(Buffer.from(arrayBuffer));
      const ext = imgUrl.split(".").pop()?.split(/\?|#/)[0] || "jpg";
      const filename = `${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
      const minioUrl = await Storage.put(filename, bufferStream);

      this.imageCache.set(imgUrl, minioUrl);
      return minioUrl;
    } catch (err) {
      Logger.error(`Lỗi tải/upload ảnh: ${imgUrl} - ${err}`);
      return null;
    }
  }

  async importMangaFromCrawler(data: MangaInput) {
    try {
      Logger.info(`Kiểm tra manga: ${data.name}`);

      let manga = await this.prisma.manga.findFirst({ where: { slug: data.slug } });

      if (!manga) {
        Logger.info(`Chưa có, tạo manga mới: ${data.name}`);

        const coverUrl = data.cover_url
          ? await this.uploadImage(data.cover_url)
          : "no-cover.png";

        manga = await this.prisma.manga.create({
          data: {
            name: data.name,
            slug: data.slug,
            other_name: data.other_name,
            cover_url: coverUrl || "no-cover.png",
            doujinshi: data.doujinshi,
            pilot: data.pilot,
            like_count: this.getRndInteger(1000, 5000),
            favorite_count: this.getRndInteger(1000, 5000),
            rating_average: this.getRndInteger(3, 5),
            view: this.getRndInteger(100000, 1000000),
            posted_by: data.posted_by,
            created_at: getNow(),
            updated_at: getNow(),
          },
        });
        Logger.success(`Đã tạo manga mới: ${manga.name}`);
      } else {
        Logger.warn(`Manga đã tồn tại: ${manga.name}`);
      }

      // Import chapters
      if (data.chapters?.length) {
        for (let i = 0; i < data.chapters.length; i++) {
          const ch = data.chapters[i];
          if (!ch) continue;

          const slug = ch.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

          let chapter = await this.prisma.chapter.findFirst({
            where: { manga_id: manga.id, OR: [{ name: ch.title }, { slug }] },
          });

          if (!chapter) {
            Logger.info(`Thêm chapter mới: ${ch.title} (${ch.images?.length || 0} ảnh)`);
            chapter = await this.prisma.chapter.create({
              data: {
                name: ch.title,
                slug,
                manga_id: manga.id,
                views: ch.view,
                order: i + 1,
                posted_by: data.posted_by,
                created_at: getNow(),
                updated_at: getNow(),
              },
            });
            await this.prisma.manga.update({
              where: { id: manga.id },
              data: { latest_chapter_id: chapter.id, updated_at: getNow() },
            });
          }

          const existServer = await this.prisma.serverChapter.findFirst({
            where: { chapter_id: chapter.id, server_id: 1 },
          });

          if (!existServer && ch.images?.length) {
            const limit = pLimit(5); // giới hạn 5 ảnh chạy song song
            const uploadedImages = await Promise.all(
              ch.images.map((imgUrl) => limit(() => this.uploadImage(imgUrl)))
            );

            const finalImages = uploadedImages.filter(Boolean) as string[];
            await this.prisma.serverChapter.create({
              data: {
                chapter_id: chapter.id,
                server_id: 1,
                content: finalImages.join("\n"),
                created_at: getNow(),
                updated_at: getNow(),
              },
            });
          }
        }
      }

      // Import genres
      if (data.genres?.length) {
        for (const g of data.genres) {
          let genre = await this.prisma.genre.findFirst({ where: { slug: g.slug } });
          if (!genre) {
            genre = await this.prisma.genre.create({
              data: { name: g.name, slug: g.slug, created_at: getNow(), updated_at: getNow() },
            });
          }

          const existRelation = await this.prisma.mangaHasGenre.findFirst({
            where: { manga_id: manga.id, genre_id: genre.id },
          });

          if (!existRelation) {
            await this.prisma.mangaHasGenre.create({
              data: { manga_id: manga.id, genre_id: genre.id },
            });
          }
        }
      }

      Logger.success(`Import hoàn tất: ${manga.name}`);
      return manga;
    } catch (error) {
      Logger.error(`Error while importing manga: ${data.name} - ${error}`);
      throw error;
    }
  }
}
