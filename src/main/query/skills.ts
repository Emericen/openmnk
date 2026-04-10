import fs from "fs"
import path from "path"
import os from "os"

type SkillMeta = { name: string; description: string }

const DEFAULT_SKILLS_DIR = path.join(os.homedir(), ".openmnk", "skills")

function getSkillsDir(): string {
  return process.env.OPENMNK_SKILLS_DIR || DEFAULT_SKILLS_DIR
}

function parseFrontmatter(content: string): {
  meta: Record<string, string>
  body: string
} {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(content)
  if (!match) return { meta: {}, body: content }

  const meta: Record<string, string> = {}
  for (const line of (match[1] || "").split("\n")) {
    const sep = line.indexOf(":")
    if (sep === -1) continue
    const key = line.slice(0, sep).trim()
    const value = line.slice(sep + 1).trim()
    if (key && value) meta[key] = value
  }
  return { meta, body: match[2] || "" }
}

export function loadSkills(dir?: string): SkillMeta[] {
  const skillsDir = dir || getSkillsDir()
  if (!fs.existsSync(skillsDir)) return []

  const files = fs.readdirSync(skillsDir).filter((f) => f.endsWith(".md"))
  const skills: SkillMeta[] = []

  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(skillsDir, file), "utf-8")
      const { meta } = parseFrontmatter(content)
      skills.push({
        name: meta.name || path.basename(file, ".md"),
        description: meta.description || "",
      })
    } catch {
      // skip unreadable files
    }
  }

  return skills
}

export function getSkillCatalog(dir?: string): SkillMeta[] {
  return loadSkills(dir)
}

export function getSkillContent(name: string, dir?: string): string | null {
  const skillsDir = dir || getSkillsDir()
  const filePath = path.join(skillsDir, `${name}.md`)
  if (!fs.existsSync(filePath)) return null
  try {
    return fs.readFileSync(filePath, "utf-8")
  } catch {
    return null
  }
}
