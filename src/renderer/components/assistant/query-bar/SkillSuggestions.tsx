import type { ReactNode } from "react"

type SkillSummary = {
  id: string
  name: string
  description: string
}

export function SkillSuggestions({
  inputText,
  suggestions,
  onRun,
  renderHighlightedTitle,
}: {
  inputText: string
  suggestions: SkillSummary[]
  onRun: (skill: SkillSummary) => void
  renderHighlightedTitle: (title: string, query: string) => ReactNode
}) {
  if (!suggestions.length) return null

  return (
    <div className="mb-2 rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="max-h-56 overflow-y-auto">
        {suggestions.map((skill) => (
          <button
            key={skill.id}
            type="button"
            className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b last:border-b-0 border-border"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onRun(skill)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-foreground truncate">
                  {renderHighlightedTitle(skill.name, inputText)}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
