import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { MangaService } from "./services/manga.service";
import type { MangaSummary, MangaChapter } from "./types/manga";
import { Logger } from "./utils/logger";

async function safeGoto(page: Page, url: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      return;
    } catch (err: any) {
      Logger.error(`Goto fail [${url}] lần ${i + 1} - ${err.message}`);
      if (i === retries - 1) throw err;
      await new Promise((res) => setTimeout(res, 3000)); // đợi rồi thử lại
    }
  }
}

// Crawl ảnh chapter
async function getChapterImages(page: Page, chapterUrl: string): Promise<string[]> {
  await safeGoto(page, chapterUrl);
  const $ = cheerio.load(await page.content());
  return $(".page-break.no-gaps img.wp-manga-chapter-img")
    .map((_, el) => ($(el).attr("src") || "").trim())
    .get();
}

// Crawl chi tiết manga
async function getMangaDetail(page: Page, url: string): Promise<MangaSummary> {
  await safeGoto(page, url);
  const $ = cheerio.load(await page.content());

  const name = $(".summary_content .rate-title").text().trim() || $("h1").text().trim();
  const rating = $("#averagerate").text().trim();
  const ratingCount = $("#countrate").text().trim();
  const rank = $(".post-content_item:contains('Rank') .summary-content").text().trim();

  const authors = $(".post-content_item:contains('Author') .author-content a").map((_, el) => $(el).text().trim()).get();
  const artists = $(".post-content_item:contains('Artist') .artist-content a").map((_, el) => $(el).text().trim()).get();
  const genres = $(".post-content_item:contains('Genre') .genres-content a").map((_, el) => $(el).text().trim()).get();
  const types = $(".post-content_item:contains('Type') .summary-content").text().trim();
  const tags = $(".post-content_item:contains('Tag') .tags-content a").map((_, el) => $(el).text().trim()).get();
  const release = $(".post-content_item:contains('Release') .summary-content a").text().trim();
  const status = $(".post-content_item:contains('Status') .summary-content").text().trim();
  const description = $(".description-summary .summary__content").html()?.trim() || "";

  const chapters: MangaChapter[] = $(".main.version-chap li.wp-manga-chapter").map((_, el) => {
    const title = $(el).find("a").text().trim();
    const url = $(el).find("a").attr("href") || "";
    const viewsText = $(el).find(".views").text().trim();
    const viewsNumber = parseInt(viewsText.replace(/,/g, ""), 10) || 0;
    return { title, url, view: viewsNumber };
  }).get();

  const orderedChapters = chapters.reverse();

  for (const chapter of orderedChapters.slice(0, 2)) {
    try {
      chapter.images = await getChapterImages(page, chapter.url);
    } catch (err: any) {
      Logger.error(`Lỗi crawl ảnh chapter [${chapter.title}] - ${err.message}`);
      chapter.images = [];
    }
  }

  return { name, rating, ratingCount, rank, authors, artists, genres, types, description, tags, release, status, chapters: orderedChapters };
}

// Import vào DB
async function importMangaFromCrawler() {
  const browser: Browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page: Page = await browser.newPage();

  // Fake user agent
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  );

  // Chặn tải nặng
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "stylesheet", "font"].includes(req.resourceType())) {
      req.abort();
    } else {
      req.continue();
    }
  });

  const url = "https://mangadistrict.com/title/";
  await safeGoto(page, url);
  const $ = cheerio.load(await page.content());

  const elements = $(".page-listing-item").toArray();
  const mangaService = new MangaService();
  const limit = pLimit(1); // crawl từ từ

  const mangaPromises = elements.map((el, idx) =>
    limit(async () => {
      const name = $(el).find(".post-title h3 a").text().trim();
      const detailLink = $(el).find(".post-title h3 a").attr("href") || "";
      const image = $(el).find(".item-thumb img").attr("src")?.trim() || "";

      Logger.info(`[${idx + 1}/${elements.length}] Crawling: ${name}`);

      try {
        const detail = await getMangaDetail(page, detailLink);

        const manga = await mangaService.importMangaFromCrawler({
          name: detail.name,
          slug: detail.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          other_name: detail.name,
          cover_url: image,
          doujinshi: "",
          pilot: detail.description,
          posted_by: 2,
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

        Logger.success(`Imported: ${manga.name}`);
      } catch (err: any) {
        Logger.error(`Manga lỗi [${name}] (${detailLink}) - ${err.message}`);
      }

      // Delay giữa các manga để tránh bị block
      await new Promise((res) => setTimeout(res, 2000));
    })
  );

  await Promise.all(mangaPromises);
  await browser.close();
}

importMangaFromCrawler();
