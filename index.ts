import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { MangaService } from "./services/manga.service";
import type { MangaSummary, MangaChapter } from "./types/manga";
import { Logger } from "./utils/logger";

// ===== Helper =====
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Crawl ảnh chapter
async function getChapterImages(page: Page, chapterUrl: string): Promise<string[]> {
  await page.goto(chapterUrl, { waitUntil: "networkidle2", timeout: 60000 });
  const $ = cheerio.load(await page.content());
  return $(".page-break.no-gaps img.wp-manga-chapter-img")
    .map((_, el) => ($(el).attr("src") || "").trim())
    .get();
}

// Crawl chi tiết manga (dùng newPage cho mỗi manga)
async function getMangaDetail(browser: Browser, url: string): Promise<MangaSummary> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
    const $ = cheerio.load(await page.content());

    const name = $(".summary_content .rate-title").text().trim() || $("h1").text().trim();
    const rating = $("#averagerate").text().trim();
    const ratingCount = $("#countrate").text().trim();
    const rank = $(".post-content_item:contains('Rank') .summary-content").text().trim();

    const authors = $(".post-content_item:contains('Author') .author-content a")
      .map((_, el) => $(el).text().trim())
      .get();
    const artists = $(".post-content_item:contains('Artist') .artist-content a")
      .map((_, el) => $(el).text().trim())
      .get();
    const genres = $(".post-content_item:contains('Genre') .genres-content a")
      .map((_, el) => $(el).text().trim())
      .get();
    const types = $(".post-content_item:contains('Type') .summary-content").text().trim();
    const tags = $(".post-content_item:contains('Tag') .tags-content a")
      .map((_, el) => $(el).text().trim())
      .get();
    const release = $(".post-content_item:contains('Release') .summary-content a").text().trim();
    const status = $(".post-content_item:contains('Status') .summary-content").text().trim();
    const description = $(".description-summary .summary__content").html()?.trim() || "";

    const chapters: MangaChapter[] = $(".main.version-chap li.wp-manga-chapter")
      .map((_, el) => {
        const title = $(el).find("a").text().trim();
        const url = $(el).find("a").attr("href") || "";
        const viewsText = $(el).find(".views").text().trim();
        const viewsNumber = parseInt(viewsText.replace(/,/g, ""), 10) || 0;
        return { title, url, view: viewsNumber };
      })
      .get();

    const orderedChapters = chapters.reverse();

    // Crawl ảnh cho vài chapter đầu tiên (demo 2 chap)
    for (const chapter of orderedChapters.slice(0, 2)) {
      try {
        chapter.images = await getChapterImages(page, chapter.url);
      } catch (err: any) {
        Logger.error(`Lỗi crawl ảnh chapter [${chapter.title}] - ${err.message}`);
        chapter.images = [];
      }
      await sleep(1000); // nghỉ 1s giữa mỗi chap
    }

    return {
      name,
      rating,
      ratingCount,
      rank,
      authors,
      artists,
      genres,
      types,
      description,
      tags,
      release,
      status,
      chapters: orderedChapters,
    };
  } finally {
    await page.close();
  }
}

// Import vào DB
async function importMangaFromCrawler() {
  const browser: Browser = await puppeteer.launch({ headless: true });
  const mangaService = new MangaService();

  try {
    const page: Page = await browser.newPage();
    const url = "https://mangadistrict.com/title/";
    await page.goto(url, { waitUntil: "networkidle2" });
    const $ = cheerio.load(await page.content());
    await page.close();

    const elements = $(".page-listing-item").toArray();
    const limit = pLimit(2); // chỉ cho 2 manga chạy song song

    const mangaPromises = elements.map((el, idx) =>
      limit(async () => {
        const name = $(el).find(".post-title h3 a").text().trim();
        const detailLink = $(el).find(".post-title h3 a").attr("href") || "";
        const image = $(el).find(".item-thumb img").attr("src")?.trim() || "";

        Logger.info(`[${idx + 1}/${elements.length}] Crawling: ${name}`);

        try {
          const detail = await getMangaDetail(browser, detailLink);

          await mangaService.importMangaFromCrawler({
            name: detail.name,
            slug: detail.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            other_name: detail.name,
            cover_url: image,
            doujinshi: "",
            pilot: detail.description,
            posted_by: 1,
            chapters: detail.chapters.map((ch) => ({
              title: ch.title,
              images: ch.images,
              view: ch.view,
            })),
            genres: detail.genres.map((g) => ({
              name: g,
              slug: g.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            })),
          });

          Logger.success(`Imported: ${name}`);
        } catch (err: any) {
          Logger.error(`Manga lỗi [${name}] (${detailLink}) - ${err.message}`);
        }

        await sleep(2000); // nghỉ 2s giữa mỗi manga
      })
    );

    await Promise.all(mangaPromises);
  } finally {
    await browser.close();
  }
}

importMangaFromCrawler();
