import { Code2, Copy, Plus, Search, Tag, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader, Panel } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useApp } from '@/lib/store';

export function RawScreen() {
  const rawOverview = useApp((s) => s.rawOverview);
  const pending = useApp((s) => s.pending);
  const addGlobalTag = useApp((s) => s.addGlobalTag);
  const removeGlobalTag = useApp((s) => s.removeGlobalTag);

  const [tagQuery, setTagQuery] = useState('');
  const [newTag, setNewTag] = useState('');
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [sectionJson, setSectionJson] = useState<string>('');
  const [loadingSection, setLoadingSection] = useState(false);

  const filteredTags = useMemo(() => {
    if (!rawOverview) return [];
    const needle = tagQuery.trim().toLowerCase();
    if (!needle) return rawOverview.globalTags.slice(0, 150);
    return rawOverview.globalTags.filter((t) => t.toLowerCase().includes(needle)).slice(0, 150);
  }, [rawOverview, tagQuery]);

  if (!rawOverview) {
    return <div className="h-64 animate-pulse rounded-xl border bg-card/40" />;
  }

  const busy = pending !== null;

  async function inspectSection(key: string) {
    setActiveSection(key);
    setLoadingSection(true);
    try {
      const text = await api.getRawSection(key);
      setSectionJson(text);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSection(false);
    }
  }

  async function handleAddTag() {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    await addGlobalTag(trimmed);
    setNewTag('');
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Story Flags & Raw Save JSON"
        description="Inspect any top-level section of the active save slot or manage EventPipeline.GlobalTags directly."
      />

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title={
            <span className="flex items-center gap-2">
              <Tag className="size-4 text-brand" />
              GlobalTags ({rawOverview.globalTags.length})
            </span>
          }
          description="Story flags read by quests, bosses, and points of no return."
        >
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add a GlobalTag (e.g. xg.村庄.石斧护符情报)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleAddTag();
                }}
              />
              <Button size="sm" disabled={busy || !newTag.trim()} onClick={() => void handleAddTag()}>
                <Plus />
                Add
              </Button>
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={tagQuery}
                onChange={(e) => setTagQuery(e.target.value)}
                placeholder="Filter existing flags…"
                className="pl-8"
              />
            </div>

            <div className="scroll-thin max-h-96 divide-y overflow-y-auto rounded-lg border">
              {filteredTags.map((tag) => (
                <div key={tag} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                  <span className="truncate font-mono">{tag}</span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={busy}
                    title="Remove flag"
                    onClick={() => void removeGlobalTag(tag)}
                  >
                    <Trash2 className="size-3 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
              ))}
              {filteredTags.length === 0 && (
                <div className="p-4 text-center text-xs text-muted-foreground">No flags match that filter.</div>
              )}
            </div>
          </div>
        </Panel>

        <Panel
          title={
            <span className="flex items-center gap-2">
              <Code2 className="size-4 text-brand" />
              Slot JSON Sections
            </span>
          }
          description="Read-only pretty JSON viewer for debugging save fields."
          actions={
            activeSection &&
            sectionJson && (
              <Button
                size="xs"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(sectionJson);
                  toast.success(`Copied ${activeSection} JSON`);
                }}
              >
                <Copy />
                Copy JSON
              </Button>
            )
          }
        >
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {rawOverview.sections.map((sec) => (
                <button
                  key={sec.key}
                  type="button"
                  onClick={() => void inspectSection(sec.key)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
                    activeSection === sec.key
                      ? 'border-brand bg-brand/15 text-brand'
                      : 'bg-background/50 text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className="font-mono">{sec.key}</span>
                  <Badge variant="secondary" className="numeric px-1 py-0 text-[10px]">
                    {sec.len}
                  </Badge>
                </button>
              ))}
            </div>

            <pre className="scroll-thin max-h-96 overflow-auto rounded-lg border bg-background/60 p-3 font-mono text-[11px] leading-relaxed">
              {loadingSection
                ? 'Loading section…'
                : activeSection
                  ? sectionJson.slice(0, 120_000) +
                    (sectionJson.length > 120_000 ? '\n… (truncated in viewer; use Copy JSON for full text)' : '')
                  : 'Click a section above to inspect its raw JSON.'}
            </pre>
          </div>
        </Panel>
      </div>
    </div>
  );
}
