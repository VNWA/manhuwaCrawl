// importManga.ts
import puppeteer, { Browser, Page } from "puppeteer";
import * as cheerio from "cheerio";
import { MangaService } from "./services/manga.service";

interface MangaChapter {
    title: string;
    url: string;
    images?: string[];
    view: number
}

interface MangaSummary {
    name: string;
    rating: string;
    ratingCount: string;
    rank: string;
    authors: string[];
    artists: string[];
    genres: string[];
    types: string;
    description: string;
    tags: string[];
    release: string;
    status: string;
    chapters: MangaChapter[];
}

interface MangaItem {
    name: string;
    detailLink: string;
    image: string;
    detail: MangaSummary;
}

// ------------------- Helper: lấy ảnh chapter -------------------
async function getChapterImages(page: Page, chapterUrl: string): Promise<string[]> {
    await page.goto(chapterUrl, { waitUntil: "networkidle2", timeout: 60000 }); // 60s
    const $ = cheerio.load(await page.content());
    const images: string[] = $(".page-break.no-gaps img.wp-manga-chapter-img")
        .map((_, el) => ($(el).attr("src") || "").trim())
        .get();
    return images;
}

// ------------------- Helper: lấy chi tiết manga -------------------
async function getMangaDetail(page: Page, url: string): Promise<MangaSummary> {
    await page.goto(url, { waitUntil: "networkidle2" });
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

    // Lấy danh sách chapter
    const chapters: MangaChapter[] = $(".main.version-chap li.wp-manga-chapter").map((_, el) => {
        const title = $(el).find("a").text().trim();
        const url = $(el).find("a").attr("href") || "";
        const viewsText = $(".views").text().trim();
        const viewsNumber = parseInt(viewsText.replace(/,/g, ""), 10);
        return { title, url, view: viewsNumber };
    }).get();

    // Đảo ngược để chapter 1 → n
    const orderedChapters = chapters.reverse();

    // Crawl ảnh cho 2 chapter đầu (demo)
    for (const chapter of orderedChapters.slice(0, 2)) {
        chapter.images = await getChapterImages(page, chapter.url);
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
}

// ------------------- Import manga + chapter vào DB -------------------
async function importMangaFromCrawler() {
    const browser: Browser = await puppeteer.launch({ headless: true });
    const page: Page = await browser.newPage();

    const url = "https://mangadistrict.com/title/";
    await page.goto(url, { waitUntil: "networkidle2" });
    const $ = cheerio.load(await page.content());

    const elements = $(".page-listing-item").toArray();
    const mangaService = new MangaService();

    for (const el of elements.slice(0, 1)) { // chỉ demo 1 manga
        const name = $(el).find(".post-title h3 a").text().trim();
        const detailLink = $(el).find(".post-title h3 a").attr("href") || "";
        const image = $(el).find(".item-thumb img").attr("src")?.trim() || "";

        const detail = await getMangaDetail(page, detailLink);

        // ✅ Import vào DB
        const manga = await mangaService.importMangaFromCrawler({
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
                view: ch.view
            })),
            genres: detail.genres.map((g) => ({ name: g, slug: g.toLowerCase().replace(/[^a-z0-9]+/g, "-") })),
        });

        console.log("Imported Manga:", manga.name);
    }

    await browser.close();
}

importMangaFromCrawler();
