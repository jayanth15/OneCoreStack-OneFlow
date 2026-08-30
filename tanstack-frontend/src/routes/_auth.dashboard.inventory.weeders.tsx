import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { apiFetchJson } from '@/lib/api'
import { isAdminOrAbove, canAccessInventory, canEditInventory } from '@/lib/user'
import {
  PlusIcon, Pencil, Trash2, Search, ImageIcon, ChevronDown, ChevronRight,
  PackagePlus, PackageMinus, History, Eye, AlertTriangle, Scissors, Folder, Printer,
  RotateCcw,
} from 'lucide-react'
import { fetchAllPages, openPrintWindow } from '@/lib/print-report'

export const Route = createFileRoute('/_auth/dashboard/inventory/weeders')({
  component: WeedersPage,
})

// ── Types ─────────────────────────────────────────────────────────────────────

interface WeederCategory {
  id: number
  name: string
  description: string | null
  image_base64: string | null
  is_active: boolean
  item_count: number
  created_at: string
  updated_at: string
}

interface WeederItem {
  id: number
  category_id: number | null
  name: string | null
  sn_no: string | null
  description: string | null
  qty: number
  reorder_level: number
  rate_per_unit: number | null
  total_rate: number | null
  storage_location: string | null
  timeline_days: number | null
  image_base64: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

interface HistoryEntry {
  id: number
  weeder_id: number
  changed_by_username: string | null
  changed_at: string
  change_type: string
  qty_before: number
  qty_after: number
  qty_delta: number
  note: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRate(n: number | null) {
  if (n == null) return '—'
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}
function fmtQty(n: number) {
  return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
}

const displayName = (item: WeederItem) => item.name || item.sn_no || item.description || `Item #${item.id}`

const ITEM_BLANK = { name: '', sn_no: '', description: '', qty: '0', reorder_level: '0', rate_per_unit: '', storage_location: '', timeline_days: '' }
const CAT_BLANK = { name: '', description: '' }

// ── Category row (lazy-loads its items when expanded) ─────────────────────────

interface CategoryRowProps {
  cat: WeederCategory
  isOpen: boolean
  admin: boolean
  showInactive: boolean
  onToggle: () => void
  onAddItem: (catId: number) => void
  onEditCat: (cat: WeederCategory) => void
  onDeleteCat: (catId: number) => void
  renderItemRow: (item: WeederItem, idx: number) => React.ReactNode
  renderItemCard: (item: WeederItem) => React.ReactNode
}

function CategoryRow({ cat, isOpen, admin, showInactive, onToggle, onAddItem, onEditCat, onDeleteCat, renderItemRow, renderItemCard }: CategoryRowProps) {
  const itemsQuery = useQuery({
    queryKey: [`/api/v1/weeders/categories/${cat.id}/items?include_inactive=${showInactive}&page_size=500`],
    enabled: isOpen,
    staleTime: 0,
  })

  const items = (itemsQuery.data as { items: WeederItem[] } | undefined)?.items ?? []
  const loadingItems = itemsQuery.isLoading

  return (
    <div key={cat.id} className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
        onClick={onToggle}>
        <button className="p-0.5 rounded hover:bg-muted transition-colors shrink-0">
          {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
        </button>
        {cat.image_base64
          ? <img src={`data:image/jpeg;base64,${cat.image_base64}`} alt={cat.name} className="size-9 rounded-md object-cover shrink-0 border" />
          : <div className="size-9 rounded-md bg-muted flex items-center justify-center shrink-0"><Folder className="size-4 text-muted-foreground/60" /></div>}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">{cat.name}</p>
          {cat.description && <p className="text-xs text-muted-foreground truncate">{cat.description}</p>}
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums">
          {cat.item_count} item{cat.item_count !== 1 ? 's' : ''}
        </Badge>
        {admin && (
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onAddItem(cat.id)}>
              <PlusIcon className="size-3.5 mr-1" />Add Item
            </Button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => onEditCat(cat)}>
              <Pencil className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive" onClick={() => onDeleteCat(cat.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>
      {isOpen && (
        <div className="border-t bg-muted/10">
          {loadingItems ? (
            <div className="p-4 space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm text-muted-foreground">No items in this category.</p>
              {admin && <Button size="sm" variant="outline" onClick={() => onAddItem(cat.id)}><PlusIcon className="size-4 mr-1" /> Add Item</Button>}
            </div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground w-8">#</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">SN No.</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Description</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">Location</th>
                      {admin && <th className="px-4 py-2 text-right font-medium text-muted-foreground">Rate/Unit</th>}
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Qty</th>
                      {admin && <th className="px-4 py-2 text-right font-medium text-muted-foreground">Total</th>}
                      <th className="px-4 py-2 text-center font-medium text-muted-foreground">Img</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">{items.map((item, i) => renderItemRow(item, i))}</tbody>
                </table>
              </div>
              <div className="md:hidden p-3 space-y-2">{items.map(item => renderItemCard(item))}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

function WeedersPage() {
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()

  const [admin] = useState(() => isAdminOrAbove())
  const [canEdit] = useState(() => isAdminOrAbove() || canEditInventory('weeder'))

  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set())

  const [search, setSearch] = useState('')
  const [searchDraft, setSearchDraft] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [catDialog, setCatDialog] = useState<'create' | 'edit' | null>(null)
  const [editingCat, setEditingCat] = useState<WeederCategory | null>(null)
  const [catForm, setCatForm] = useState({ ...CAT_BLANK })
  const [catImgPreview, setCatImgPreview] = useState<string | null>(null)
  const [catImgB64, setCatImgB64] = useState<string | null>(null)
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState<string | null>(null)
  const catImgRef = useRef<HTMLInputElement>(null)

  const [deleteCatId, setDeleteCatId] = useState<number | null>(null)

  const [itemDialog, setItemDialog] = useState<'create' | 'edit' | null>(null)
  const [itemDialogCatId, setItemDialogCatId] = useState<number>(0)
  const [editingItem, setEditingItem] = useState<WeederItem | null>(null)
  const [itemForm, setItemForm] = useState({ ...ITEM_BLANK })
  const [itemImgPreview, setItemImgPreview] = useState<string | null>(null)
  const [itemImgB64, setItemImgB64] = useState<string | null>(null)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemFormError, setItemFormError] = useState<string | null>(null)
  const itemImgRef = useRef<HTMLInputElement>(null)

  const [deleteItemId, setDeleteItemId] = useState<number | null>(null)

  const [adjustItem, setAdjustItem] = useState<WeederItem | null>(null)
  const [adjustType, setAdjustType] = useState<'add' | 'subtract'>('add')
  const [adjustQty, setAdjustQty] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustError, setAdjustError] = useState<string | null>(null)

  const [viewItem, setViewItem] = useState<WeederItem | null>(null)

  const [historyItem, setHistoryItem] = useState<WeederItem | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  // list-level mutation errors (delete etc.)
  const [catsMutationError, setCatsMutationError] = useState<string | null>(null)

  useEffect(() => {
    if (!canAccessInventory('weeder')) {
      navigate({ href: '/dashboard/inventory', replace: true })
    }
  }, [])

  // ── Fetch ───────────────────────────────────────────────────────────────────

  const catsQuery = useQuery({
    queryKey: [`/api/v1/weeders/categories?include_inactive=${showInactive}`],
    staleTime: 0,
  })

  const searchQuery = useQuery({
    queryKey: [`/api/v1/weeders?search=${encodeURIComponent(search)}&page_size=200&include_inactive=${showInactive}`],
    enabled: search !== '',
    staleTime: 0,
  })

  const historyQuery = useQuery({
    queryKey: [
      `/api/v1/weeders/${historyItem?.id}/history?limit=10&offset=${(historyPage - 1) * 10}`,
    ],
    enabled: historyItem !== null,
    staleTime: 0,
  })

  const saveCatMutation = useMutation({
    mutationFn: (body: { name: string; description: string | null; image_base64: string | null }) =>
      apiFetchJson(
        catDialog === 'create' ? '/api/v1/weeders/categories' : `/api/v1/weeders/categories/${editingCat!.id}`,
        { method: catDialog === 'create' ? 'POST' : 'PUT', body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      setCatDialog(null)
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weeders'] })
    },
    onError: (e: unknown) => setCatError(e instanceof Error ? e.message : 'Save failed'),
  })

  const deleteCatMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/weeders/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteCatId(null)
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weeders'] })
    },
    onError: (e: unknown) => setCatsMutationError(e instanceof Error ? e.message : 'Delete failed'),
  })

  const saveItemMutation = useMutation({
    mutationFn: (body: {
      name: string | null
      sn_no: string | null
      description: string | null
      qty: number
      reorder_level: number
      rate_per_unit: number | null
      storage_location: string | null
      timeline_days: number | null
      image_base64: string | null
    }) =>
      apiFetchJson(
        itemDialog === 'create' ? `/api/v1/weeders/categories/${itemDialogCatId}/items` : `/api/v1/weeders/${editingItem!.id}`,
        { method: itemDialog === 'create' ? 'POST' : 'PUT', body: JSON.stringify(body) },
      ),
    onSuccess: () => {
      setItemDialog(null)
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weeders'] })
    },
    onError: (e: unknown) => setItemFormError(e instanceof Error ? e.message : 'Save failed'),
  })

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => apiFetchJson(`/api/v1/weeders/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setDeleteItemId(null)
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weeders'] })
    },
    onError: (e: unknown) => setCatsMutationError(e instanceof Error ? e.message : 'Delete failed'),
  })

  const restoreMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetchJson(`/api/v1/weeders/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: true }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weeders'] })
    },
    onError: (e: unknown) => setCatsMutationError(e instanceof Error ? e.message : 'Restore failed'),
  })

  const adjustMutation = useMutation({
    mutationFn: (body: { adjustment_type: 'add' | 'subtract'; quantity: number; note: string | null }) =>
      apiFetchJson(`/api/v1/weeders/${adjustItem!.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      setAdjustItem(null)
      queryClient.invalidateQueries({ queryKey: ['/api/v1/weeders'] })
    },
    onError: (e: unknown) => setAdjustError(e instanceof Error ? e.message : 'Failed'),
  })

  // ── Derived data ────────────────────────────────────────────────────────────

  const categories = (catsQuery.data as WeederCategory[] | undefined) ?? []
  const catsLoading = catsQuery.isLoading
  const catsError = catsMutationError ?? (catsQuery.error instanceof Error ? catsQuery.error.message : null)

  const searchData = searchQuery.data as { items: WeederItem[] } | undefined
  const searchResults = useMemo(() => {
    const items = searchData?.items ?? []
    return items.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx)
  }, [searchData])
  const searchLoading = searchQuery.isLoading || searchQuery.isFetching

  const historyRows = (historyQuery.data as HistoryEntry[] | undefined) ?? []
  const historyLoading = historyQuery.isLoading
  const historyError = historyQuery.isError ? 'Failed to load history' : null
  const historyHasMore = (historyQuery.data as HistoryEntry[] | undefined)?.length === 10

  // ── Category handlers ───────────────────────────────────────────────────────

  function toggleCategory(catId: number) {
    setExpandedCats(prev => {
      const next = new Set(prev)
      if (next.has(catId)) next.delete(catId)
      else next.add(catId)
      return next
    })
  }

  function openCreateCat() {
    setEditingCat(null)
    setCatForm({ ...CAT_BLANK })
    setCatImgPreview(null)
    setCatImgB64(null)
    setCatError(null)
    setCatDialog('create')
  }
  function openEditCat(cat: WeederCategory) {
    setEditingCat(cat)
    setCatForm({ name: cat.name, description: cat.description ?? '' })
    setCatImgPreview(cat.image_base64 ? `data:image/jpeg;base64,${cat.image_base64}` : null)
    setCatImgB64(cat.image_base64 ?? null)
    setCatError(null)
    setCatDialog('edit')
  }
  function handleCatImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onload = () => { const d = r.result as string; setCatImgPreview(d); setCatImgB64(d.split(',')[1] ?? null) }
    r.readAsDataURL(file)
  }
  async function saveCat() {
    if (!catForm.name.trim()) { setCatError('Name is required'); return }
    setCatSaving(true)
    setCatError(null)
    const body = { name: catForm.name.trim(), description: catForm.description || null, image_base64: catImgB64 }
    saveCatMutation.mutate(body, {
      onSettled: () => setCatSaving(false),
    })
  }
  function doDeleteCat() {
    if (deleteCatId === null) return
    deleteCatMutation.mutate(deleteCatId)
  }

  // ── Item handlers ───────────────────────────────────────────────────────────

  function openCreateItem(catId: number) {
    setEditingItem(null)
    setItemDialogCatId(catId)
    setItemForm({ ...ITEM_BLANK })
    setItemImgPreview(null)
    setItemImgB64(null)
    setItemFormError(null)
    setItemDialog('create')
  }
  function openEditItem(item: WeederItem) {
    setEditingItem(item)
    setItemDialogCatId(item.category_id ?? 0)
    setItemForm({
      name: item.name ?? '',
      sn_no: item.sn_no ?? '',
      description: item.description ?? '',
      qty: String(item.qty),
      reorder_level: String(item.reorder_level ?? 0),
      rate_per_unit: item.rate_per_unit != null ? String(item.rate_per_unit) : '',
      storage_location: item.storage_location ?? '',
      timeline_days: item.timeline_days != null ? String(item.timeline_days) : '',
    })
    setItemImgPreview(item.image_base64 ? `data:image/jpeg;base64,${item.image_base64}` : null)
    setItemImgB64(item.image_base64 ?? null)
    setItemFormError(null)
    setItemDialog('edit')
  }
  function handleItemImg(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const r = new FileReader()
    r.onload = () => { const d = r.result as string; setItemImgPreview(d); setItemImgB64(d.split(',')[1] ?? null) }
    r.readAsDataURL(file)
  }
  async function saveItem() {
    if (!itemForm.name.trim() && !itemForm.sn_no.trim() && !itemForm.description.trim()) { setItemFormError('Name, SN No. or Description is required'); return }
    setItemSaving(true)
    setItemFormError(null)
    const body = {
      name: itemForm.name || null,
      sn_no: itemForm.sn_no || null,
      description: itemForm.description || null,
      qty: parseFloat(itemForm.qty) || 0,
      reorder_level: parseFloat(itemForm.reorder_level) || 0,
      rate_per_unit: itemForm.rate_per_unit ? parseFloat(itemForm.rate_per_unit) : null,
      storage_location: itemForm.storage_location || null,
      timeline_days: itemForm.timeline_days ? parseInt(itemForm.timeline_days) : null,
      image_base64: itemImgB64,
    }
    saveItemMutation.mutate(body, {
      onSettled: () => setItemSaving(false),
    })
  }
  function doDeleteItem() {
    if (deleteItemId === null) return
    deleteItemMutation.mutate(deleteItemId)
  }

  // ── Adjust stock ────────────────────────────────────────────────────────────

  function openAdjust(item: WeederItem, type: 'add' | 'subtract') {
    setAdjustItem(item)
    setAdjustType(type)
    setAdjustQty('')
    setAdjustNote('')
    setAdjustError(null)
  }
  async function doAdjust() {
    if (!adjustItem) return
    const qty = parseFloat(adjustQty)
    if (isNaN(qty) || qty <= 0) { setAdjustError('Enter a positive quantity'); return }
    setAdjustError(null)
    adjustMutation.mutate({
      adjustment_type: adjustType,
      quantity: qty,
      note: adjustNote || null,
    })
  }

  // ── History ─────────────────────────────────────────────────────────────────

  function openHistory(item: WeederItem) {
    setHistoryItem(item)
    setHistoryPage(1)
  }
  function changeHistoryPage(newPage: number) {
    if (!historyItem) return
    setHistoryPage(newPage)
  }

  // ── Print ───────────────────────────────────────────────────────────────────

  async function printInventory() {
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const params = new URLSearchParams({ page: String(printPage), page_size: String(pageSize), include_inactive: 'false' })
      if (search) params.set('search', search)
      return apiFetchJson<{ items: WeederItem[]; total: number; page: number; page_size: number; pages: number }>('/api/v1/weeders?' + params)
    })
    openPrintWindow({
      title: 'Weeder Inventory Cycle Count', mode: 'cycle-count',
      columns: ['SN No.', 'Name', 'Description', 'System Qty', 'Physical Count', 'Variance', 'Location', 'Counter Initials', 'Notes'],
      rows: all.map(item => ({ 'SN No.': item.sn_no ?? '', 'Name': item.name ?? '', 'Description': item.description ?? '', 'System Qty': String(item.qty), 'Physical Count': '', 'Variance': '', 'Location': item.storage_location ?? '', 'Counter Initials': '', 'Notes': '' })),
    })
  }

  async function printHistory() {
    if (!historyItem) return
    const all = await fetchAllPages(async (printPage, pageSize) => {
      const rows = await apiFetchJson<HistoryEntry[]>('/api/v1/weeders/' + historyItem.id + '/history?limit=' + pageSize + '&offset=' + ((printPage - 1) * pageSize))
      return { items: rows, total: 0, page: printPage, page_size: pageSize, pages: 0 }
    })
    openPrintWindow({
      title: 'Weeder History — ' + displayName(historyItem), mode: 'audit-history',
      columns: ['Date', 'Action', 'Before', 'Change', 'After', 'User', 'Note'],
      rows: all.map(row => ({ 'Date': new Date(row.changed_at).toLocaleString(), 'Action': row.change_type, 'Before': String(row.qty_before), 'Change': String(row.qty_delta), 'After': String(row.qty_after), 'User': row.changed_by_username ?? 'System', 'Note': row.note ?? '' })),
    })
  }

  // ── Row / card renderers ────────────────────────────────────────────────────

  function renderItemRow(item: WeederItem, idx: number) {
    const isLow = item.reorder_level > 0 && item.qty <= item.reorder_level
    return (
      <tr key={item.id} className="hover:bg-muted/20 transition-colors">
        <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
        <td className="px-4 py-2.5 max-w-[150px]">
          {item.name
            ? <span className="block truncate text-sm font-medium" title={item.name}>{item.name}</span>
            : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="px-4 py-2.5 max-w-[120px]">
          {item.sn_no ? <Badge variant="secondary" className="font-mono max-w-full truncate block">{item.sn_no}</Badge>
            : <span className="text-muted-foreground text-xs">—</span>}
        </td>
        <td className="px-4 py-2.5 max-w-xs"><span className="block truncate text-sm" title={item.description ?? ''}>{item.description ?? '—'}</span></td>
        <td className="px-4 py-2.5 text-muted-foreground text-sm max-w-[130px]"><span className="block truncate">{item.storage_location ?? '—'}</span></td>
        {admin && <td className="px-4 py-2.5 text-right tabular-nums text-sm font-medium">{fmtRate(item.rate_per_unit)}</td>}
        <td className={`px-4 py-2.5 text-right tabular-nums text-sm ${isLow ? 'text-warning font-medium' : ''}`}>
          <span className="inline-flex items-center gap-1 justify-end">
            {isLow && <AlertTriangle className="size-3" />}
            {fmtQty(item.qty)}
            {item.reorder_level > 0 && <span className="text-muted-foreground text-[10px] font-normal"> /{fmtQty(item.reorder_level)}</span>}
          </span>
        </td>
        {admin && <td className="px-4 py-2.5 text-right tabular-nums text-sm font-medium">{item.total_rate != null ? fmtRate(item.total_rate) : '—'}</td>}
        <td className="px-4 py-2.5 text-center">
          {item.image_base64
            ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt="weeder" className="size-8 rounded object-cover mx-auto" />
            : <ImageIcon className="size-3.5 text-muted-foreground/30 mx-auto" />}
        </td>
        <td className="px-4 py-2.5 text-right">
          <div className="inline-flex gap-0.5">
            <Button variant="ghost" size="icon" className="size-7" title="View" onClick={() => setViewItem(item)}>
              <Eye className="size-3.5 text-primary" />
            </Button>
            {canEdit && <>
              <Button variant="ghost" size="icon" className="size-7" title="Add Stock" onClick={() => openAdjust(item, 'add')}>
                <PackagePlus className="size-3.5 text-success" />
              </Button>
              <Button variant="ghost" size="icon" className="size-7" title="Remove Stock" onClick={() => openAdjust(item, 'subtract')}>
                <PackageMinus className="size-3.5 text-warning" />
              </Button>
            </>}
            {admin && <Button variant="ghost" size="icon" className="size-7" title="History" onClick={() => openHistory(item)}>
              <History className="size-3.5 text-muted-foreground" />
            </Button>}
            {admin && <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditItem(item)}>
              <Pencil className="size-3.5" />
            </Button>}
            {admin && <>
              {item.is_active ? (
                <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteItemId(item.id)}>
                  <Trash2 className="size-3.5" />
                </Button>
              ) : (
                <Button variant="ghost" size="icon" className="size-7 text-success hover:text-success"
                  title="Restore (reactivate)" onClick={() => restoreMutation.mutate(item.id)}>
                  <RotateCcw className="size-3.5" />
                </Button>
              )}
            </>}
          </div>
        </td>
      </tr>
    )
  }

  function renderItemCard(item: WeederItem) {
    const isLow = item.reorder_level > 0 && item.qty <= item.reorder_level
    return (
      <div key={item.id} className="rounded-lg border p-3 bg-card">
        <div className="flex items-start gap-3">
          {item.image_base64
            ? <img src={`data:image/jpeg;base64,${item.image_base64}`} alt="weeder" className="size-12 rounded-lg object-cover shrink-0" />
            : <div className="size-12 rounded-lg bg-muted flex items-center justify-center shrink-0"><Scissors className="size-5 text-muted-foreground/40" /></div>}
          <div className="flex-1 min-w-0">
            {item.name && <p className="font-semibold text-sm">{item.name}</p>}
            {item.sn_no && <p className="font-semibold text-sm font-mono">{item.sn_no}</p>}
            {item.description && <p className="text-sm text-muted-foreground truncate">{item.description}</p>}
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {item.storage_location && <span>📍 {item.storage_location}</span>}
              {admin && item.rate_per_unit != null && <span>{fmtRate(item.rate_per_unit)} / unit</span>}
              <span className={`font-semibold ${isLow ? 'text-warning' : 'text-foreground'}`}>
                {isLow && <AlertTriangle className="size-3 inline mr-0.5" />}
                Qty: {fmtQty(item.qty)}
                {item.reorder_level > 0 && <span className="text-muted-foreground font-normal text-[10px]"> /{fmtQty(item.reorder_level)}</span>}
              </span>
              {admin && item.total_rate != null && <span className="font-medium text-foreground">Total: {fmtRate(item.total_rate)}</span>}
            </div>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setViewItem(item)}><Eye className="size-3.5 text-primary" /></Button>
            {canEdit && <>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openAdjust(item, 'add')}><PackagePlus className="size-3.5 text-success" /></Button>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openAdjust(item, 'subtract')}><PackageMinus className="size-3.5 text-warning" /></Button>
            </>}
            {admin && <Button variant="ghost" size="icon" className="size-8" onClick={() => openHistory(item)}><History className="size-3.5 text-muted-foreground" /></Button>}
            {admin && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEditItem(item)}><Pencil className="size-3.5" /></Button>}
            {admin && <>
              {item.is_active ? (
                <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteItemId(item.id)}><Trash2 className="size-3.5" /></Button>
              ) : (
                <Button variant="ghost" size="icon" className="size-8 text-success hover:text-success"
                  title="Restore (reactivate)" onClick={() => restoreMutation.mutate(item.id)}><RotateCcw className="size-3.5" /></Button>
              )}
            </>}
          </div>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <PageHeader
        title="Weeders"
        description={categories.length > 0
          ? `${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'} · ${categories.reduce((s, c) => s + c.item_count, 0)} items`
          : 'Weeder inventory'}
        breadcrumbs={[
          { label: 'Inventory', href: '/dashboard/inventory' },
          { label: 'Weeders' },
        ]}
        actions={<>
          <Button size="sm" variant="outline" onClick={printInventory}><Printer className="size-4 mr-1" />Print</Button>
          {admin && <Button size="sm" onClick={openCreateCat}><PlusIcon className="size-4 mr-1" /> New Category</Button>}
        </>}
      />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold">Weeders</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {categories.length > 0
                ? `${categories.length} categor${categories.length !== 1 ? 'ies' : 'y'} · ${categories.reduce((s, c) => s + c.item_count, 0)} items`
                : 'Weeder inventory'}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {admin && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                <input type="checkbox" checked={showInactive}
                  onChange={(e) => setShowInactive(e.target.checked)} className="size-3 rounded" />
                Show inactive
              </label>
            )}
            <form onSubmit={e => { e.preventDefault(); setSearch(searchDraft.trim()) }} className="flex gap-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                <input type="text" value={searchDraft} onChange={e => setSearchDraft(e.target.value)}
                  placeholder="Search items…"
                  className="pl-8 pr-3 py-1.5 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring w-56" />
              </div>
              <Button type="submit" size="sm" variant="secondary">Search</Button>
              {search && <Button type="button" size="sm" variant="ghost" onClick={() => { setSearch(''); setSearchDraft('') }}>Clear</Button>}
            </form>
          </div>
        </div>

        {catsError && <p className="text-sm text-destructive">{catsError}</p>}

        {search && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {searchLoading ? 'Searching…' : `${searchResults.length} result${searchResults.length !== 1 ? 's' : ''} for "${search}"`}
            </p>
            {searchLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
            ) : searchResults.length === 0 ? (
              <div className="rounded-xl border p-10 text-center">
                <Scissors className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">No items matching &quot;{search}&quot;.</p>
              </div>
            ) : (
              <>
                <div className="hidden md:block rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-8">#</th>
                          <th className="px-4 py-2.5 text-left font-medium">Name</th>
                          <th className="px-4 py-2.5 text-left font-medium">SN No.</th>
                          <th className="px-4 py-2.5 text-left font-medium">Description</th>
                          <th className="px-4 py-2.5 text-left font-medium">Location</th>
                          {admin && <th className="px-4 py-2.5 text-right font-medium">Rate/Unit</th>}
                          <th className="px-4 py-2.5 text-right font-medium">Qty</th>
                          {admin && <th className="px-4 py-2.5 text-right font-medium">Total</th>}
                          <th className="px-4 py-2.5 text-center font-medium">Img</th>
                          <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">{searchResults.map((item, i) => renderItemRow(item, i))}</tbody>
                    </table>
                  </div>
                </div>
                <div className="md:hidden space-y-2">{searchResults.map(item => renderItemCard(item))}</div>
              </>
            )}
          </div>
        )}

        {!search && (
          <>
            {catsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}</div>
            ) : categories.length === 0 ? (
              <div className="rounded-xl border p-14 text-center space-y-3">
                <Scissors className="size-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No weeder categories yet.</p>
                {admin && <Button size="sm" onClick={openCreateCat}><PlusIcon className="size-4 mr-1" /> Add First Category</Button>}
              </div>
            ) : (
              <div className="space-y-3">
                {categories.map(cat => (
                  <CategoryRow
                    key={cat.id}
                    cat={cat}
                    isOpen={expandedCats.has(cat.id)}
                    admin={admin}
                    showInactive={showInactive}
                    onToggle={() => toggleCategory(cat.id)}
                    onAddItem={openCreateItem}
                    onEditCat={openEditCat}
                    onDeleteCat={setDeleteCatId}
                    renderItemRow={renderItemRow}
                    renderItemCard={renderItemCard}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Category Create / Edit Dialog ─────────────────────────── */}
      <Dialog open={catDialog !== null} onOpenChange={o => !o && setCatDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>{catDialog === 'create' ? 'New Category' : `Edit — ${editingCat?.name ?? ''}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name *</Label>
              <Input id="cat-name" placeholder="e.g. Power Weeder" value={catForm.name}
                onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} disabled={catSaving} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-desc">Description</Label>
              <textarea id="cat-desc" rows={2} placeholder="Optional description…" value={catForm.description}
                onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} disabled={catSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="space-y-1.5">
              <Label>Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <div className="flex items-center gap-3">
                {catImgPreview
                  ? <img src={catImgPreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                  : <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center"><ImageIcon className="size-5 text-muted-foreground/40" /></div>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => catImgRef.current?.click()} disabled={catSaving}>
                    {catImgPreview ? 'Change' : 'Upload'}
                  </Button>
                  {catImgPreview && <Button type="button" size="sm" variant="ghost" onClick={() => { setCatImgPreview(null); setCatImgB64(null) }} disabled={catSaving}>Remove</Button>}
                </div>
                <input ref={catImgRef} type="file" accept="image/*" className="hidden" onChange={handleCatImg} />
              </div>
            </div>
            {catError && <p className="text-sm text-destructive">{catError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={saveCat} disabled={catSaving} className="flex-1">
                {catSaving ? 'Saving…' : catDialog === 'create' ? 'Create Category' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setCatDialog(null)} disabled={catSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Item Create / Edit Dialog ─────────────────────────────── */}
      <Dialog open={itemDialog !== null} onOpenChange={o => !o && setItemDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader className="mb-2">
            <DialogTitle>
              {itemDialog === 'create'
                ? `New Item — ${categories.find(c => c.id === itemDialogCatId)?.name ?? ''}`
                : `Edit — ${editingItem ? displayName(editingItem) : ''}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="w-name">Name</Label>
              <Input id="w-name" placeholder="e.g. Power Weeder 470cc" value={itemForm.name}
                onChange={e => setItemForm(f => ({ ...f, name: e.target.value }))} disabled={itemSaving} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-sn">SN No. <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                <Input id="w-sn" placeholder="e.g. WDR-001" value={itemForm.sn_no}
                  onChange={e => setItemForm(f => ({ ...f, sn_no: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-loc">Storage Location</Label>
                <Input id="w-loc" placeholder="e.g. Rack C1" value={itemForm.storage_location}
                  onChange={e => setItemForm(f => ({ ...f, storage_location: e.target.value }))} disabled={itemSaving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-desc">Description</Label>
              <textarea id="w-desc" rows={2} placeholder="Describe this weeder item…" value={itemForm.description}
                onChange={e => setItemForm(f => ({ ...f, description: e.target.value }))} disabled={itemSaving}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="w-qty">Total Qty</Label>
                <Input id="w-qty" type="number" min="0" step="any" placeholder="0" value={itemForm.qty}
                  onChange={e => setItemForm(f => ({ ...f, qty: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-rl">Reorder Level</Label>
                <Input id="w-rl" type="number" min="0" step="any" placeholder="0" value={itemForm.reorder_level}
                  onChange={e => setItemForm(f => ({ ...f, reorder_level: e.target.value }))} disabled={itemSaving} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="w-rate">Rate / Unit (₹)</Label>
                <Input id="w-rate" type="number" min="0" step="any" placeholder="0.00" value={itemForm.rate_per_unit}
                  onChange={e => setItemForm(f => ({ ...f, rate_per_unit: e.target.value }))} disabled={itemSaving} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-timeline">Timeline (days)</Label>
              <Input id="w-timeline" type="number" inputMode="numeric" min="1" step="1" placeholder="e.g. 7" value={itemForm.timeline_days}
                onChange={e => setItemForm(f => ({ ...f, timeline_days: e.target.value }))} disabled={itemSaving} />
            </div>
            <div className="space-y-1.5">
              <Label>Image <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <div className="flex items-center gap-3">
                {itemImgPreview
                  ? <img src={itemImgPreview} alt="preview" className="size-14 rounded-lg object-cover border" />
                  : <div className="size-14 rounded-lg border-2 border-dashed flex items-center justify-center"><ImageIcon className="size-5 text-muted-foreground/40" /></div>}
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => itemImgRef.current?.click()} disabled={itemSaving}>
                    {itemImgPreview ? 'Change' : 'Upload'}
                  </Button>
                  {itemImgPreview && <Button type="button" size="sm" variant="ghost" onClick={() => { setItemImgPreview(null); setItemImgB64(null) }} disabled={itemSaving}>Remove</Button>}
                </div>
                <input ref={itemImgRef} type="file" accept="image/*" className="hidden" onChange={handleItemImg} />
              </div>
            </div>
            {itemFormError && <p className="text-sm text-destructive">{itemFormError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={saveItem} disabled={itemSaving} className="flex-1">
                {itemSaving ? 'Saving…' : itemDialog === 'create' ? 'Create Item' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => setItemDialog(null)} disabled={itemSaving}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Adjust Stock Dialog ───────────────────────────────────── */}
      <Dialog open={adjustItem !== null} onOpenChange={o => !o && setAdjustItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center gap-2">
              {adjustType === 'add' ? <PackagePlus className="size-4 text-success" /> : <PackageMinus className="size-4 text-warning" />}
              {adjustType === 'add' ? 'Add Stock' : 'Remove Stock'} — {adjustItem ? displayName(adjustItem) : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
              Current qty: <span className="font-semibold tabular-nums">{adjustItem ? fmtQty(adjustItem.qty) : ''}</span>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-qty">Quantity *</Label>
              <Input id="adj-qty" type="number" min="0.001" step="any" placeholder="0"
                value={adjustQty} onChange={e => setAdjustQty(e.target.value)} disabled={adjustMutation.isPending} autoFocus />
            </div>
            {adjustType === 'subtract' && adjustItem && (() => {
              const entered = parseFloat(adjustQty)
              if (!isNaN(entered) && entered > adjustItem.qty) return (
                <div className="flex items-start gap-1.5 rounded-md bg-warning/15 border border-warning/20 px-3 py-2 text-sm text-warning">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>Only <strong>{fmtQty(adjustItem.qty)}</strong> available — stock will be reduced to 0.</span>
                </div>
              )
              return null
            })()}
            <div className="space-y-1.5">
              <Label htmlFor="adj-note">Note <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
              <Input id="adj-note" placeholder="e.g. Monthly restock" value={adjustNote}
                onChange={e => setAdjustNote(e.target.value)} disabled={adjustMutation.isPending} />
            </div>
            {adjustError && <p className="text-sm text-destructive">{adjustError}</p>}
            <div className="flex gap-3 pt-1">
              <Button onClick={doAdjust} disabled={adjustMutation.isPending} className="flex-1" variant={adjustType === 'subtract' ? 'destructive' : 'default'}>
                {adjustMutation.isPending ? 'Saving…' : adjustType === 'add' ? 'Add Stock' : 'Remove Stock'}
              </Button>
              <Button variant="outline" onClick={() => setAdjustItem(null)} disabled={adjustMutation.isPending}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── View Detail Dialog ────────────────────────────────────── */}
      <Dialog open={viewItem !== null} onOpenChange={o => !o && setViewItem(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="break-words pr-6">{viewItem ? displayName(viewItem) : ''}</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4 mt-1">
              {/* Image */}
              {viewItem.image_base64
                ? <img src={`data:image/jpeg;base64,${viewItem.image_base64}`} alt="weeder" className="w-full max-h-56 object-contain rounded-lg border bg-muted/20" />
                : <div className="w-full h-24 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground/30"><Scissors className="size-10" /></div>
              }

              {/* Status badges */}
              <div className="flex flex-wrap gap-1.5">
                {!viewItem.is_active && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded border bg-destructive/10 text-destructive border-destructive/20">Inactive</span>
                )}
                {viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border bg-warning/15 text-amber-800 border-warning/20">
                    <AlertTriangle className="size-3" /> Low Stock
                  </span>
                )}
              </div>

              {/* Details grid */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Details</p>
                <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                  {viewItem.name && <><span className="text-muted-foreground whitespace-nowrap">Name</span><span className="font-medium break-words">{viewItem.name}</span></>}
                  {viewItem.sn_no && <><span className="text-muted-foreground whitespace-nowrap">SN No.</span><span className="font-mono font-medium break-all">{viewItem.sn_no}</span></>}
                  {viewItem.description && <><span className="text-muted-foreground whitespace-nowrap">Description</span><span className="break-words">{viewItem.description}</span></>}
                  <span className="text-muted-foreground whitespace-nowrap">Category</span>
                  <span>{categories.find(c => c.id === viewItem.category_id)?.name ?? '—'}</span>
                  {viewItem.storage_location && (
                    <><span className="text-muted-foreground whitespace-nowrap">Location</span><span className="break-words">{viewItem.storage_location}</span></>
                  )}
                  {viewItem.timeline_days != null && (
                    <><span className="text-muted-foreground whitespace-nowrap">Lead Time</span><span>{viewItem.timeline_days} day{viewItem.timeline_days !== 1 ? 's' : ''}</span></>
                  )}
                  <span className="text-muted-foreground whitespace-nowrap">Updated</span>
                  <span className="text-muted-foreground text-xs">{fmtDate(viewItem.updated_at)}</span>
                </div>
              </div>

              {/* Stock overview */}
              <div className="rounded-lg border bg-muted/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Stock Overview</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">On Hand</p>
                    <p className={`text-lg font-semibold tabular-nums ${viewItem.reorder_level > 0 && viewItem.qty <= viewItem.reorder_level ? 'text-warning' : ''}`}>
                      {fmtQty(viewItem.qty)}
                    </p>
                  </div>
                  {viewItem.reorder_level > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground">Reorder Level</p>
                      <p className="text-lg font-semibold tabular-nums">{fmtQty(viewItem.reorder_level)}</p>
                    </div>
                  )}
                  {admin && viewItem.rate_per_unit != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Rate / Unit</p>
                      <p className="text-lg font-semibold">{fmtRate(viewItem.rate_per_unit)}</p>
                    </div>
                  )}
                  {admin && viewItem.total_rate != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Total Value</p>
                      <p className="text-lg font-semibold">{fmtRate(viewItem.total_rate)}</p>
                    </div>
                  )}
                </div>
                {/* Stock bar */}
                {viewItem.reorder_level > 0 && (
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0</span>
                      <span>Reorder: {fmtQty(viewItem.reorder_level)}</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${viewItem.qty <= viewItem.reorder_level ? 'bg-warning' : 'bg-success'}`}
                        style={{ width: `${Math.min(100, (viewItem.qty / (viewItem.reorder_level * 2)) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── History Dialog ────────────────────────────────────────── */}
      <Dialog open={historyItem !== null} onOpenChange={o => !o && setHistoryItem(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><History className="size-4" /> Stock History — {historyItem ? displayName(historyItem) : ''}</span>
              <Button size="sm" variant="outline" onClick={printHistory} disabled={!historyItem}><Printer className="size-3.5 mr-1" />Print</Button>
            </DialogTitle>
          </DialogHeader>
          {historyLoading ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : historyError ? (
            <p className="text-sm text-destructive text-center py-8">{historyError}</p>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No history yet.</p>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Before</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Change</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">After</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">By</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Note</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyRows.map(r => (
                    <tr key={r.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.changed_at)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.change_type === 'add' ? 'text-success' : r.change_type === 'subtract' ? 'text-warning' : 'text-primary'}`}>
                          {r.change_type === 'add' && <PackagePlus className="size-3" />}
                          {r.change_type === 'subtract' && <PackageMinus className="size-3" />}
                          {r.change_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtQty(r.qty_before)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums font-medium ${r.qty_delta > 0 ? 'text-success' : r.qty_delta < 0 ? 'text-warning' : ''}`}>
                        {r.qty_delta > 0 ? '+' : ''}{fmtQty(r.qty_delta)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtQty(r.qty_after)}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.changed_by_username ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.note ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(historyPage > 1 || historyHasMore) && (
                <div className="flex items-center justify-between pt-3 pb-1">
                  <Button size="sm" variant="outline" disabled={historyPage <= 1 || historyLoading} onClick={() => changeHistoryPage(historyPage - 1)}>← Prev</Button>
                  <span className="text-sm text-muted-foreground">Page {historyPage}</span>
                  <Button size="sm" variant="outline" disabled={!historyHasMore || historyLoading} onClick={() => changeHistoryPage(historyPage + 1)}>Next →</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Category Confirmation ──────────────────────────── */}
      <AlertDialog open={deleteCatId !== null} onOpenChange={o => !o && setDeleteCatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the category. Items inside it will remain but won&apos;t be visible until the category is restored.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteCatMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteCat} disabled={deleteCatMutation.isPending}>{deleteCatMutation.isPending ? 'Deleting…' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Delete Item Confirmation ──────────────────────────────── */}
      <AlertDialog open={deleteItemId !== null} onOpenChange={o => !o && setDeleteItemId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete item?</AlertDialogTitle>
            <AlertDialogDescription>This will deactivate the item. It can be restored later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteItemMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doDeleteItem} disabled={deleteItemMutation.isPending}>{deleteItemMutation.isPending ? 'Deleting…' : 'Delete'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
