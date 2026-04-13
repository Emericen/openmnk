const API_KEY = process.env.NOTION_API_KEY || ""
const ROOT_PAGE = process.env.NOTION_ROOT_PAGE || ""
const BASE = "https://api.notion.com/v1"
const HEADERS = {
  Authorization: `Bearer ${API_KEY}`,
  "Notion-Version": "2022-06-28",
}

const PAGE_RE =
  /<page url="https:\/\/www\.notion\.so\/([^"]+)">([^<]+)<\/page>/g

async function fetchPage(pageId: string): Promise<string> {
  const res = await fetch(`${BASE}/pages/${pageId}/markdown`, {
    headers: HEADERS,
  })
  const data = (await res.json()) as { markdown?: string }
  return data.markdown || ""
}

async function fetchSubpages(
  pageId: string
): Promise<Array<{ id: string; title: string; content: string }>> {
  const rootMarkdown = fetchPage(pageId)
  const matches = [...(await rootMarkdown).matchAll(PAGE_RE)]
  const subpageIds = matches.map((m) => ({ id: m[1], title: m[2] }))
  const pages = await Promise.all(
    subpageIds.map(async (p) => ({
      id: p.id || "",
      title: p.title || "",
      content: await fetchPage(p.id || ""),
    }))
  )
  return pages
}

/** First subpage = system prompt. Rest = skills. */
export async function load() {
  if (!API_KEY || !ROOT_PAGE)
    return { system: "", skills: [] as { title: string; content: string }[] }
  const subpages = await fetchSubpages(ROOT_PAGE)
  const system = subpages[0]
  const skills = subpages.slice(1)
  return {
    system: system ? `# ${system.title}\n\n${system.content}` : "",
    skills: skills.map((s) => ({
      title: s.title,
      content: `# ${s.title}\n\n${s.content}`,
    })),
  }
}
