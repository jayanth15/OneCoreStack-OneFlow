import { useEffect, useRef, useState } from "react"
import { Link, createFileRoute } from "@tanstack/react-router"
import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { apiFetchJson } from "@/lib/api"
import { isAdminOrAbove } from "@/lib/user"
import { ArrowLeft } from "lucide-react"

export const Route = createFileRoute("/_auth/dashboard/inventory/spares/new")({
  component: NewSpareCategoryPage,
})

function NewSpareCategoryPage() {
  const navigate = Route.useNavigate()
  const [form, setForm] = useState({ name: "", description: "" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Redirect non-admins away
    if (!isAdminOrAbove()) {
      navigate({ href: "/dashboard/inventory/spares", replace: true })
      return
    }
    nameRef.current?.focus()
  }, [navigate])

  function setField(key: keyof typeof form, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError("Category name is required"); return }
    setSaving(true)
    setError(null)
    try {
      await apiFetchJson("/api/v1/spares/categories", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || null,
        }),
      })
      navigate({ href: "/dashboard/inventory/spares" })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create category")
      setSaving(false)
    }
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        title="New Spare Category"
        description={`Create a category to group related spare parts together (e.g. &ldquo;Engines&rdquo;, &ldquo;Filters&rdquo;, &ldquo;Belts&rdquo;).`}
        breadcrumbs={[
          { label: "Inventory", href: "/dashboard/inventory" },
          { label: "Spares", href: "/dashboard/inventory/spares" },
          { label: "New Category" },
        ]}
      />

      <div className="p-4 md:p-6 max-w-lg">
        {/* Back link */}
        <Link
          to="/dashboard/inventory/spares"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="size-3.5" />
          Back to Spares
        </Link>

        <h1 className="text-xl font-semibold mb-1">New Spare Category</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Create a category to group related spare parts together (e.g. &ldquo;Engines&rdquo;, &ldquo;Filters&rdquo;, &ldquo;Belts&rdquo;).
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="cat-name">
              Category Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="cat-name"
              ref={nameRef}
              placeholder="e.g. Engines"
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              disabled={saving}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cat-desc">
              Description{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <textarea
              id="cat-desc"
              rows={3}
              placeholder="Brief description of this category…"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              disabled={saving}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2 border border-destructive/20">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="submit" disabled={saving} className="min-w-[120px]">
              {saving ? "Creating…" : "Create Category"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => navigate({ href: "/dashboard/inventory/spares" })}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </>
  )
}
