export interface MangaChapter {
    title: string;
    url: string;
    images?: string[];
    view: number;
  }
  
  export interface MangaSummary {
    name: string;
    rating: string;
    ratingCount: string;
    rank: string;
    authors: string[];
    artists: string[];
    genres: string[];
    types: string;
    avatar: string;
    description: string;
    tags: string[];
    release: string;
    status: string;
    chapters: MangaChapter[];
  }
  