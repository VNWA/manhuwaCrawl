// services/manga.service.ts
import { PrismaClient } from "@prisma/client";

interface ChapterInput {
  title: string;
  images?: string[];
  view: number

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

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient || new PrismaClient();
  }
  getRndInteger(min: number, max: number) {
    return Math.floor(Math.random() * (max - min)) + min;
  }
  // ------------------- Import manga từ crawler -------------------
  async importMangaFromCrawler(data: MangaInput) {
    // Check manga theo slug
    let manga = await this.prisma.manga.findFirst({
      where: { slug: data.slug },
    });

    // Nếu chưa có thì tạo mới
    if (!manga) {
      manga = await this.prisma.manga.create({
        data: {
          name: data.name,
          slug: data.slug,
          other_name: data.other_name,
          cover_url: data.cover_url || "no-cover.png",
          doujinshi: data.doujinshi,
          pilot: data.pilot,
          like_count: this.getRndInteger(1000, 5000),
          favorite_count: this.getRndInteger(1000, 5000),
          rating_average: this.getRndInteger(3, 5),
          view: this.getRndInteger(100000, 1000000),

          posted_by: data.posted_by,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    // ------------------- Import chapter -------------------
    if (data.chapters && data.chapters.length > 0) {
      for (let i = 0; i < data.chapters.length; i++) {
        const ch = data.chapters[i];
        if (!ch) continue; // Skip if ch is undefined
        const slug = ch.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");

        // Check xem chapter đã tồn tại cho manga này chưa
        let chapter = await this.prisma.chapter.findFirst({
          where: {
            manga_id: manga.id,
            OR: [{ name: ch.title }, { slug }],
          },
        });

        // Chỉ tạo mới nếu chưa tồn tại
        if (!chapter) {
          chapter = await this.prisma.chapter.create({
            data: {
              name: ch.title,
              slug,
              manga_id: manga.id,
              views: ch.view,
              order: i + 1, // thứ tự hợp lý
              posted_by: 1,
              created_at: new Date(),
              updated_at: new Date(),
            },
          });

          // ------------------- Import server_chapter chỉ với chapter mới -------------------
          if (ch.images && ch.images.length > 0) {
            await this.prisma.serverChapter.create({
              data: {
                chapter_id: chapter.id,
                server_id: 1,
                content: ch.images.join("\n"),
                created_at: new Date(),
                updated_at: new Date(),
              },
            });
          }
        }
        // ------------------- Import genres -------------------
        if (data.genres && data.genres.length > 0) {
          for (const g of data.genres) {
            let genre = await this.prisma.genre.findFirst({ where: { slug: g.slug } });
            if (!genre) {
              genre = await this.prisma.genre.create({
                data: { name: g.name, slug: g.slug, created_at: new Date(), updated_at: new Date() },
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


      }
    }


    return manga;
  }

  async getAllMangas() {
    return this.prisma.manga.findMany({
      include: {
        chapters: { include: { serverChapters: true } },
        genres: { include: { genre: true } },
      },
    });
  }
}
function randomInt(arg0: number, arg1: number): any {
  throw new Error("Function not implemented.");
}

